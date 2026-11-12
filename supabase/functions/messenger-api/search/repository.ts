export class SearchRepository {
  constructor(database) { this.db = database; }
  db;
  listConversationIds(userId) {
    return this.db.from("conversation_members").select("conversation_id").eq("user_id", userId).is("left_at", null).limit(1000);
  }
  searchMessages(ids, term, limit = 30) {
    return this.db.from("messages").select("id,conversation_id,sender_id,body,created_at,reply_to")
      .in("conversation_id", ids).ilike("body", "%" + term + "%").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(limit);
  }
}
