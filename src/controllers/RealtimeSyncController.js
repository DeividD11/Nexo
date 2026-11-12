/**
 * Secure fallback transport for custom opaque sessions.
 * Supabase Realtime requires a Supabase-compatible JWT for private-channel RLS;
 * Nexo's opaque session tokens are intentionally not sent to Realtime.
 * All sync requests therefore pass through the authenticated Edge Function.
 */
export class RealtimeSyncController {
  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.userId = null;
    this.conversationId = null;
    this.cycleTimer = null;
    this.heartbeatTimer = null;
    this.typingStopTimer = null;
    this.cycleRunning = false;
    this.cycleCount = 0;
    this.lastTypingSentAt = 0;
    this.lastPresencePingAt = 0;
    this.isTyping = false;
    this.unsubscribe = null;
    this.boundOnline = () => this.handleOnline();
    this.boundOffline = () => this.handleOffline();
    this.boundVisibility = () => this.handleVisibility();
  }

  mount() {
    this.unsubscribe = this.model.subscribe((state) => this.onState(state));
    window.addEventListener("online", this.boundOnline);
    window.addEventListener("offline", this.boundOffline);
    document.addEventListener("visibilitychange", this.boundVisibility);
    this.onState(this.model.state);
  }

  dispose() {
    this.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener("online", this.boundOnline);
    window.removeEventListener("offline", this.boundOffline);
    document.removeEventListener("visibilitychange", this.boundVisibility);
  }

  onState(state) {
    const nextUserId = state.user?.id || null;
    const nextConversationId = state.activeConversation?.id || null;

    if (nextUserId !== this.userId) {
      this.stop();
      this.userId = nextUserId;
      this.conversationId = nextConversationId;
      this.isTyping = false;
      if (nextUserId) this.start();
      else {
        this.model.update({ networkStatus: "offline", presence: [] });
      }
      return;
    }

    if (nextConversationId !== this.conversationId) {
      const previousConversation = this.conversationId;
      this.conversationId = nextConversationId;
      this.isTyping = false;
      this.model.update({ presence: [] });
      if (previousConversation && this.userId) {
        this.model.pingPresence(previousConversation, false).catch(() => {});
      }
      if (nextConversationId && this.userId) this.runCycle(true);
    }
  }

  start() {
    if (!this.userId || this.cycleTimer) return;
    this.model.update({ networkStatus: navigator.onLine === false ? "offline" : "connecting" });
    this.runCycle(true);
    this.cycleTimer = window.setInterval(() => this.runCycle(false), 4500);
    this.heartbeatTimer = window.setInterval(() => this.sendHeartbeat(), 25_000);
  }

  stop() {
    if (this.cycleTimer) window.clearInterval(this.cycleTimer);
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    if (this.typingStopTimer) window.clearTimeout(this.typingStopTimer);
    this.cycleTimer = null;
    this.heartbeatTimer = null;
    this.typingStopTimer = null;
    this.cycleRunning = false;
    this.lastTypingSentAt = 0;
    this.isTyping = false;
  }

  async runCycle(force) {
    if (!this.userId || this.cycleRunning) return;
    if (navigator.onLine === false) {
      this.model.update({ networkStatus: "offline" });
      return;
    }

    this.cycleCount += 1;
    if (!force && document.hidden && this.cycleCount % 4 !== 0) return;
    this.cycleRunning = true;
    const conversationId = this.conversationId;
    const tasks = [];
    if (conversationId) {
      tasks.push(this.model.syncNewMessages(this.view.captureHistory()?.nearBottom === true));
      tasks.push(this.model.loadPresenceForConversation(conversationId));
    }
    if (force || this.cycleCount % 3 === 0) {
      tasks.push(this.model.loadConversations({ silent: true }));
      tasks.push(this.model.loadNotifications({ silent: true }));
    }
    if (force) tasks.push(this.sendHeartbeat());

    try {
      if (!tasks.length) {
        this.model.update({ networkStatus: "online", lastSyncAt: new Date().toISOString() });
      } else {
        const results = await Promise.allSettled(tasks);
        if (results.every((result) => result.status === "rejected")) {
          throw results.find((result) => result.status === "rejected")?.reason || new Error("Sync failed");
        }
        this.model.update({ networkStatus: "online", lastSyncAt: new Date().toISOString() });
      }
    } catch (error) {
      this.model.update({ networkStatus: navigator.onLine === false ? "offline" : "reconnecting" });
      console.warn("nexo_sync_cycle_failed", error?.message || "unknown");
    } finally {
      this.cycleRunning = false;
    }
  }

  async sendHeartbeat() {
    if (!this.userId || navigator.onLine === false) return;
    try {
      await this.model.pingPresence(this.conversationId, this.isTyping);
      this.lastPresencePingAt = Date.now();
    } catch (error) {
      this.model.update({ networkStatus: navigator.onLine === false ? "offline" : "reconnecting" });
      throw error;
    }
  }

  onTyping() {
    const conversationId = this.conversationId;
    if (!this.userId || !conversationId || navigator.onLine === false) return;
    this.isTyping = true;
    const now = Date.now();
    if (now - this.lastTypingSentAt >= 1800) {
      this.lastTypingSentAt = now;
      this.model.pingPresence(conversationId, true).catch((error) => {
        console.warn("nexo_typing_presence_failed", error?.message || "unknown");
      });
    }
    if (this.typingStopTimer) window.clearTimeout(this.typingStopTimer);
    this.typingStopTimer = window.setTimeout(() => this.stopTyping(), 2600);
  }

  stopTyping() {
    if (this.typingStopTimer) window.clearTimeout(this.typingStopTimer);
    this.typingStopTimer = null;
    const conversationId = this.conversationId;
    this.isTyping = false;
    if (this.userId && conversationId && navigator.onLine !== false) {
      this.model.pingPresence(conversationId, false).catch(() => {});
    }
    this.lastTypingSentAt = 0;
  }

  handleOffline() {
    this.model.update({ networkStatus: "offline" });
  }

  handleOnline() {
    if (!this.userId) return;
    this.model.update({ networkStatus: "reconnecting" });
    this.runCycle(true);
  }

  handleVisibility() {
    if (!this.userId || document.hidden) return;
    this.model.update({ networkStatus: navigator.onLine === false ? "offline" : "reconnecting" });
    this.runCycle(true);
  }
}
