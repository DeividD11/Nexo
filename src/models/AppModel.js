import { User } from "./entities/User.js";
import { Conversation } from "./entities/Conversation.js";

export class AppModel {
  constructor({ authRepository, profileRepository, conversationRepository, messageRepository, contactRepository, groupRepository, presenceRepository, fileRepository, notificationRepository, settingsRepository, searchRepository }) {
    this.auth = authRepository;
    this.profile = profileRepository;
    this.conversations = conversationRepository;
    this.messages = messageRepository;
    this.contacts = contactRepository;
    this.groups = groupRepository;
    this.presenceRepository = presenceRepository;
    this.files = fileRepository;
    this.notifications = notificationRepository;
    this.settings = settingsRepository;
    this.search = searchRepository;
    this.state = {
      user: null,
      conversations: [],
      activeConversation: null,
      messages: [],
      presence: [],
      networkStatus: "connecting",
      lastSyncAt: null,
      messagesLoading: false,
      messagesLoadingEarlier: false,
      messagesHasMore: true,
      replyingTo: null,
      historyRestore: null,
      contacts: [],
      incomingRequests: [],
      outgoingRequests: [],
      blockedUsers: [],
      contactTab: "contacts",
      accountLoading: false,
      loading: false,
      error: "",
      theme: this.readTheme(),
      themePreference: this.readThemePreference(),
      pendingAttachments: [],
      notifications: [],
      unreadNotificationCount: 0,
      notificationLoading: false,
      settings: { theme: "system", desktop_notifications: false, message_previews: true, in_app_notifications: true, sound_notifications: false },
      settingsLoading: false,
      deviceSessions: [],
      sessionsLoading: false,
      sessionsError: "",
      searchResults: null,
      route: "app",
    };
    this.listeners = new Set();
    this.messageSyncPromise = null;
  }

  readThemePreference() {
    try {
      const value = localStorage.getItem("nexo.theme.v1");
      return ["light", "dark", "system"].includes(value) ? value : "system";
    } catch { return "system"; }
  }

  readTheme() {
    const preference = this.readThemePreference();
    if (preference !== "system") return preference;
    try { return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
    catch { return "light"; }
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify() { for (const listener of this.listeners) listener(this.state); }
  update(values) { Object.assign(this.state, values); this.notify(); }

  async refreshProfile() {
    const profile = await this.profile.get();
    const user = new User(profile);
    this.update({ user });
    return user;
  }

  async pingPresence(conversationId = null, typing = false) {
    if (!this.state.user || !this.presenceRepository) return null;
    return this.presenceRepository.ping(conversationId, typing);
  }

  async loadPresenceForConversation(conversationId) {
    if (!this.state.user || !conversationId || !this.presenceRepository) return [];
    const presence = await this.presenceRepository.inConversation(conversationId);
    if (this.state.activeConversation?.id !== conversationId) return [];
    this.update({ presence: Array.isArray(presence) ? presence : [] });
    return this.state.presence;
  }

  async restoreSession() {
    const sessionUser = await this.auth.restore();
    this.update({ user: sessionUser ? new User(sessionUser) : null });
    if (!sessionUser) return;
    try { await this.refreshProfile(); }
    catch { /* Keep the valid session if the profile endpoint is temporarily unavailable. */ }
    await Promise.all([
      this.loadConversations(), this.loadAccountData(),
      this.loadSettings().catch(() => null),
      this.loadNotifications({ silent: true }).catch(() => null),
      this.loadDeviceSessions().catch(() => null),
    ]);
  }

  async loadConversations({ silent = false } = {}) {
    if (!this.state.user) return;
    if (!silent) this.update({ loading: true, error: "" });
    try {
      const conversations = await this.conversations.list();
      const activeId = this.state.activeConversation?.id;
      const activeConversation = activeId ? conversations.find((item) => item.id === activeId) || null : null;
      this.update({ conversations, activeConversation, loading: false });
    } catch (error) {
      this.update({ loading: false, error: error.message });
      throw error;
    }
  }

  async openConversation(conversation) {
    for (const attachment of this.state.pendingAttachments || []) {
      if (attachment.previewObjectUrl) URL.revokeObjectURL(attachment.previewObjectUrl);
      this.files?.delete(attachment.id).catch(() => {});
    }
    this.update({
      activeConversation: conversation instanceof Conversation ? conversation : new Conversation(conversation),
      messages: [],
      presence: [],
      messagesLoading: true,
      messagesLoadingEarlier: false,
      messagesHasMore: true,
      replyingTo: null,
      pendingAttachments: [],
      historyRestore: { mode: "bottom" },
      error: "",
    });
    try {
      const messages = await this.messages.list(conversation.id, null, 50);
      this.update({
        messages,
        messagesLoading: false,
        messagesHasMore: messages.length >= 50,
        historyRestore: { mode: "bottom" },
      });
      await this.messages.markRead(conversation.id).catch(() => {});
    } catch (error) {
      this.update({ messagesLoading: false, error: error.message });
    }
  }

  async loadEarlierMessages(historyRestore = null) {
    const conversation = this.state.activeConversation;
    const oldest = this.state.messages[0];
    if (!conversation || !oldest?.createdAt || this.state.messagesLoadingEarlier || !this.state.messagesHasMore) return;
    this.update({ messagesLoadingEarlier: true });
    try {
      const older = await this.messages.list(conversation.id, oldest.createdAt, 50, oldest.id);
      const known = new Set(this.state.messages.map((message) => message.id));
      const combined = [...older.filter((message) => !known.has(message.id)), ...this.state.messages];
      this.update({
        messages: combined,
        messagesLoadingEarlier: false,
        messagesHasMore: older.length >= 50,
        historyRestore: historyRestore || { mode: "position", scrollTop: 0, scrollHeight: 0 },
      });
    } catch (error) {
      this.update({ messagesLoadingEarlier: false, error: error.message });
    }
  }

  async syncNewMessages(forceBottom = false) {
    if (this.messageSyncPromise) return this.messageSyncPromise;
    const conversation = this.state.activeConversation;
    if (!conversation || this.state.messagesLoading || this.state.messagesLoadingEarlier) return false;

    this.messageSyncPromise = (async () => {
      const conversationId = conversation.id;
      const knownBefore = new Set(this.state.messages.map((message) => message.id));
      const firstPage = await this.messages.list(conversationId, null, 50);
      if (this.state.activeConversation?.id !== conversationId) return false;

      const newestKnown = this.state.messages.at(-1) || null;
      const incremental = [];
      let backlogUnfinished = false;
      if (newestKnown?.createdAt && newestKnown?.id) {
        let cursor = newestKnown;
        // Drain multiple pages after reconnect so a long offline gap does not skip messages.
        for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
          const page = await this.messages.listAfter(conversationId, cursor, 50);
          if (this.state.activeConversation?.id !== conversationId) return false;
          if (!page.length) break;
          incremental.push(...page);
          cursor = page.at(-1);
          if (page.length < 50) break;
          if (pageNumber === 9) backlogUnfinished = true;
        }
      }

      const merged = new Map(this.state.messages.map((message) => [message.id, message]));
      // Recent history is fetched on every cycle so edits, tombstones and delivery/read
      // receipts on already-known messages are refreshed, not only newly inserted rows.
      // If a large reconnect backlog still has pages pending, do not jump the cursor to
      // the newest page; the next cycle must continue from the last drained page.
      const incrementalIds = new Set(incremental.map((message) => message.id));
      for (const message of firstPage) {
        if (!backlogUnfinished || knownBefore.has(message.id) || incrementalIds.has(message.id)) {
          merged.set(message.id, message);
        }
      }
      for (const message of incremental) merged.set(message.id, message);
      const messages = [...merged.values()].sort((a, b) => {
        const byDate = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return byDate || String(a.id).localeCompare(String(b.id));
      });
      const newCount = messages.filter((message) => !knownBefore.has(message.id)).length;
      const restore = newCount
        ? (forceBottom ? { mode: "bottom" } : { mode: "near-bottom" })
        : { mode: "position" };

      this.update({ messages, historyRestore: restore });
      if (newCount && !(typeof document !== "undefined" && document.hidden)) {
        await this.messages.markRead(conversationId).catch(() => {});
      }
      return true;
    })();

    try {
      return await this.messageSyncPromise;
    } finally {
      this.messageSyncPromise = null;
    }
  }

  async reloadMessages(historyRestore = { mode: "position" }) {
    const conversation = this.state.activeConversation;
    if (!conversation) return;
    const messages = await this.messages.list(conversation.id, null, 50);
    this.update({ messages, messagesHasMore: messages.length >= 50, historyRestore });
  }

  async loadAccountData() {
    if (!this.state.user) return;
    this.update({ accountLoading: true });
    try {
      const [contacts, blockedUsers] = await Promise.all([
        this.contacts.list(),
        this.contacts.listBlocked(),
      ]);
      this.update({
        contacts: contacts.contacts || [],
        incomingRequests: contacts.incoming || [],
        outgoingRequests: contacts.outgoing || [],
        blockedUsers: blockedUsers || [],
        accountLoading: false,
      });
    } catch (error) {
      this.update({ accountLoading: false, error: error.message });
      throw error;
    }
  }

  async loadContacts() { await this.loadAccountData(); return { contacts: this.state.contacts }; }

  async loadNotifications({ silent = false } = {}) {
    if (!this.state.user || !this.notifications) return;
    if (!silent) this.update({ notificationLoading: true });
    try {
      const result = await this.notifications.list();
      this.update({
        notifications: result.items || [],
        unreadNotificationCount: Number(result.unreadCount || 0),
        notificationLoading: false,
      });
    } catch (error) {
      this.update({ notificationLoading: false });
      if (!silent) throw error;
    }
  }

  async markNotificationRead(notificationId) {
    if (!this.notifications) return;
    await this.notifications.markRead(notificationId);
    this.update({
      notifications: this.state.notifications.map((item) => item.id === notificationId && !item.read_at
        ? { ...item, read_at: new Date().toISOString() } : item),
      unreadNotificationCount: Math.max(0, this.state.unreadNotificationCount - (this.state.notifications.some((item) => item.id === notificationId && !item.read_at) ? 1 : 0)),
    });
  }

  async loadSettings() {
    if (!this.state.user || !this.settings) return;
    const settings = await this.settings.get();
    this.update({ settings, themePreference: settings.theme });
    this.setTheme(settings.theme, { persist: false });
    return settings;
  }

  async loadDeviceSessions() {
    if (!this.state.user || typeof this.auth?.sessions !== "function") return [];
    this.update({ sessionsError: "" });
    try {
      const deviceSessions = await this.auth.sessions();
      const normalized = Array.isArray(deviceSessions) ? deviceSessions : [];
      this.update({ deviceSessions: normalized, sessionsError: "" });
      return normalized;
    } catch (error) {
      this.update({ sessionsError: error?.message || "No se pudieron consultar las sesiones." });
      throw error;
    }
  }

  setTheme(theme, { persist = true } = {}) {
    const preference = ["light", "dark", "system"].includes(theme) ? theme : "system";
    let actual = preference;
    if (preference === "system") {
      try { actual = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
      catch { actual = "light"; }
    }
    this.update({ theme: actual, themePreference: preference });
    if (persist) {
      try { localStorage.setItem("nexo.theme.v1", preference); } catch { /* Storage may be unavailable. */ }
    }
  }
}
