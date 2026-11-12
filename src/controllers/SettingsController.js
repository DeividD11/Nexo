export class SettingsController {
  constructor(model, view) { this.model = model; this.view = view; }

  async open() {
    this.model.update({ modal: { type: "settings", title: "Preferencias y dispositivos" }, settingsLoading: true, sessionsLoading: true, sessionsError: "" });
    this.view.focusModal();
    await Promise.allSettled([this.model.loadSettings(), this.model.loadDeviceSessions()]);
    this.model.update({ settingsLoading: false, sessionsLoading: false });
  }

  async save(form) {
    const data = new FormData(form);
    const values = {
      theme: String(data.get("theme") || "system"),
      desktopNotifications: data.get("desktopNotifications") === "on",
      messagePreviews: data.get("messagePreviews") === "on",
      inAppNotifications: data.get("inAppNotifications") === "on",
      soundNotifications: data.get("soundNotifications") === "on",
    };
    this.view.setSubmitBusy(form, true, "Guardando…");
    try {
      if (values.desktopNotifications && typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      const settings = await this.model.settings.update(values);
      this.model.update({ settings, themePreference: settings.theme });
      this.model.setTheme(settings.theme);
      this.view.toast("Preferencias guardadas.");
    } catch (error) { this.view.showModalError(error.message); }
    finally { this.view.setSubmitBusy(form, false); }
  }


  async reloadSessions() {
    this.model.update({ sessionsLoading: true, sessionsError: "" });
    try {
      await this.model.loadDeviceSessions();
    } catch (error) {
      this.view.toast(error.message || "No se pudieron consultar las sesiones.", "error");
    } finally {
      this.model.update({ sessionsLoading: false });
    }
  }

  async revoke(sessionId) {
    try {
      await this.model.auth.revokeSession(sessionId);
      await this.model.loadDeviceSessions();
      this.view.toast("Sesión cerrada.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async revokeOthers() {
    try {
      const result = await this.model.auth.revokeOtherSessions();
      await this.model.loadDeviceSessions();
      this.view.toast(`Se cerraron ${result.revoked || 0} sesiones.`);
    } catch (error) { this.view.toast(error.message, "error"); }
  }
}
