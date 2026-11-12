import { SettingsRepository } from "./repository.ts";

const DEFAULT_SETTINGS = {
  theme: "system", desktop_notifications: false, message_previews: true,
  in_app_notifications: true, sound_notifications: false,
};

export class SettingsService {
  constructor(database, deps) { this.repository = new SettingsRepository(database); this.deps = deps; }
  repository;
  deps;
  error(message, status = 400, code = "BAD_REQUEST") { throw new this.deps.ApiError(message, status, code); }
  async get(user) {
    const { data, error } = await this.repository.get(user.id);
    if (error) this.error("No se pudieron cargar las preferencias.", 503, "SETTINGS_LOOKUP_FAILED");
    return { ...DEFAULT_SETTINGS, ...(data || {}) };
  }
  async update(user, input) {
    await this.deps.rateLimit("settings:" + user.id, 40, 900);
    const current = await this.get(user);
    const theme = ["light", "dark", "system"].includes(input.theme) ? input.theme : current.theme;
    const record = {
      theme,
      desktop_notifications: typeof input.desktopNotifications === "boolean" ? input.desktopNotifications : current.desktop_notifications,
      message_previews: typeof input.messagePreviews === "boolean" ? input.messagePreviews : current.message_previews,
      in_app_notifications: typeof input.inAppNotifications === "boolean" ? input.inAppNotifications : current.in_app_notifications,
      sound_notifications: typeof input.soundNotifications === "boolean" ? input.soundNotifications : current.sound_notifications,
    };
    const { data, error } = await this.repository.save(user.id, record);
    if (error || !data) {
      console.error("settings_update_failed", error?.code || "unknown");
      this.error("No se pudieron guardar las preferencias.", 503, "SETTINGS_UPDATE_FAILED");
    }
    return data;
  }
}
