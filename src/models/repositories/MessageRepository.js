import { Message } from "../entities/Message.js";

export class MessageRepository {
  constructor(apiClient) { this.api = apiClient; }

  async list(conversationId, before = null, limit = 50, beforeId = null) {
    const data = await this.api.request("messages.list", {
      conversationId,
      limit,
      ...(before ? { before } : {}),
      ...(beforeId ? { beforeId } : {}),
    });
    return data.map((item) => new Message(item));
  }

  async listAfter(conversationId, latestMessage, limit = 50) {
    if (!latestMessage?.createdAt || !latestMessage?.id) return [];
    const data = await this.api.request("messages.list", {
      conversationId,
      limit,
      after: latestMessage.createdAt,
      afterId: latestMessage.id,
    });
    return data.map((item) => new Message(item));
  }

  send(conversationId, body, clientNonce = crypto.randomUUID(), replyTo = null, attachmentIds = []) {
    return this.api.request("messages.send", { conversationId, body, clientNonce, replyTo, attachmentIds });
  }

  edit(messageId, body) { return this.api.request("messages.edit", { messageId, body }); }
  delete(messageId) { return this.api.request("messages.delete", { messageId }); }
  react(messageId, emoji, remove = false) { return this.api.request("messages.react", { messageId, emoji, remove }); }
  markRead(conversationId) { return this.api.request("messages.read", { conversationId }); }
}
