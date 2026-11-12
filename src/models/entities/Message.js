export class Message {
  constructor(data = {}) {
    this.id = data.id || "";
    this.conversationId = data.conversation_id || data.conversationId || "";
    this.senderId = data.sender_id || data.senderId || "";
    this.body = data.body || "";
    this.messageType = data.message_type || data.messageType || "text";
    this.replyTo = data.reply_to || data.replyTo || null;
    this.createdAt = data.created_at || data.createdAt || null;
    this.editedAt = data.edited_at || data.editedAt || null;
    this.deletedAt = data.deleted_at || data.deletedAt || null;
    this.sender = data.sender || null;
    this.attachments = Array.isArray(data.attachments) ? data.attachments : [];
    this.receipts = Array.isArray(data.receipts) ? data.receipts : [];
    this.reactions = Array.isArray(data.reactions) ? data.reactions : [];
    this.metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  }
}
