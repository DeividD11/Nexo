export class SettingsRepository {
  constructor(database) { this.db = database; }
  db;
  get(userId) {
    return this.db.from("user_settings")
      .select("theme,desktop_notifications,message_previews,in_app_notifications,sound_notifications")
      .eq("user_id", userId).maybeSingle();
  }
  save(userId, record) {
    return this.db.from("user_settings").upsert({ ...record, user_id: userId, updated_at: new Date().toISOString() })
      .select("theme,desktop_notifications,message_previews,in_app_notifications,sound_notifications").single();
  }
}
