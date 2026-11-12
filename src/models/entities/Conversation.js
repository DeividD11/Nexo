export class Conversation {
  constructor(data = {}) {
    this.id = data.id || "";
    this.kind = data.kind || "private";
    this.title = data.displayTitle || data.title || "Conversación";
    this.avatarPath = data.displayAvatar || data.avatarUrl || data.avatar_path || null;
    this.avatarUrl = data.avatarUrl || data.displayAvatar || null;
    this.description = data.description || "";
    this.lastMessage = data.last_message_preview || data.lastMessage || "";
    this.lastMessageAt = data.last_message_at || data.lastMessageAt || data.created_at || null;
    this.unreadCount = Number(data.unreadCount || 0);
    this.myRole = data.myRole || "member";
    this.members = Array.isArray(data.members) ? data.members : [];
  }
}
