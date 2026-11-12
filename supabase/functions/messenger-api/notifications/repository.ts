export class NotificationRepository {
  constructor(database) { this.db = database; }
  db;
  listForUser(userId, limit = 60) {
    return this.db.from("notifications").select("id,actor_id,kind,entity_id,title,body,read_at,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  }
  countUnread(userId) {
    return this.db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  }
  markOne(userId, id, now) {
    return this.db.from("notifications").update({ read_at: now }).eq("user_id", userId).eq("id", id)
      .is("read_at", null).select("id").maybeSingle();
  }
  markAll(userId, now) {
    return this.db.from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null).select("id");
  }
}
