export class NotificationController {
  constructor(model, view) {
    this.model = model;
    this.view = view;
    this.unsubscribe = null;
    this.seen = null;
  }

  mount() {
    this.unsubscribe = this.model.subscribe((state) => this.onState(state));
  }

  dispose() { this.unsubscribe?.(); this.unsubscribe = null; }

  onState(state) {
    if (!state.user) { this.seen = null; return; }
    const items = state.notifications || [];
    if (this.seen === null) {
      this.seen = new Set(items.map((item) => item.id));
      return;
    }
    const fresh = items.filter((item) => !this.seen.has(item.id));
    for (const item of items) this.seen.add(item.id);
    if (!fresh.length) return;

    for (const item of fresh) {
      if (state.settings?.in_app_notifications !== false) {
        this.view.toast(item.title || "Nueva notificación", "info");
      }
      if (state.settings?.desktop_notifications && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const body = state.settings?.message_previews === false ? "Tienes una nueva actividad en Nexo." : (item.body || "Abre Nexo para ver los detalles.");
        const notification = new Notification(item.title || "Nexo", { body, tag: item.id, renotify: false });
        notification.onclick = () => { window.focus(); this.open(); notification.close(); };
      }
      if (state.settings?.sound_notifications) this.playTone();
    }
  }

  playTone() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.045, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => context.close();
    } catch { /* Audio may be blocked by browser autoplay policy. */ }
  }

  async open() {
    this.model.update({ modal: { type: "notifications", title: "Notificaciones" }, notificationLoading: true });
    this.view.focusModal();
    try { await this.model.loadNotifications(); }
    catch (error) { this.view.toast(error.message, "error"); }
    finally { this.model.update({ notificationLoading: false }); }
  }

  async markRead(id) {
    try { await this.model.markNotificationRead(id); }
    catch (error) { this.view.toast(error.message, "error"); }
  }

  async markAllRead() {
    try {
      await this.model.notifications.markAllRead();
      await this.model.loadNotifications();
      this.view.toast("Notificaciones marcadas como leídas.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }
}
