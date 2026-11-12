export class PresenceRepository {
  constructor(apiClient) { this.api = apiClient; }

  ping(conversationId = null, typing = false) {
    return this.api.request("presence.ping", {
      ...(conversationId ? { conversationId } : {}),
      typing: Boolean(typing),
    });
  }

  inConversation(conversationId) {
    return this.api.request("presence.conversation", { conversationId });
  }
}
