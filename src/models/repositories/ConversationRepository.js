import { Conversation } from "../entities/Conversation.js";

export class ConversationRepository {
  constructor(apiClient) { this.api = apiClient; }
  async list() { return (await this.api.request("conversations.list")).map((item) => new Conversation(item)); }
  create(userId) { return this.api.request("conversations.create", { userId }); }
  async get(id) { return (await this.list()).find((conversation) => conversation.id === id) || null; }
}
