import { SearchRepository } from "./repository.ts";

export class SearchService {
  constructor(database, deps) { this.repository = new SearchRepository(database); this.deps = deps; }
  repository;
  deps;
  error(message, status = 400, code = "BAD_REQUEST") { throw new this.deps.ApiError(message, status, code); }
  async conversations(user, input) {
    await this.deps.rateLimit("search-conversations:" + user.id, 60, 60);
    const query = this.deps.str(input.query, 80).toLocaleLowerCase();
    if ([...query].length < 2) return [];
    const rows = await this.deps.getConversationSummary(user.id);
    return rows.filter((conversation) => {
      const fields = [conversation.displayTitle, conversation.title, conversation.description,
        ...(conversation.members || []).flatMap((member) => [member.displayName, member.username])];
      return fields.some((value) => String(value || "").toLocaleLowerCase().includes(query));
    }).slice(0, 30);
  }
  async messages(user, input) {
    await this.deps.rateLimit("search-messages:" + user.id, 40, 60);
    const raw = this.deps.str(input.query, 80);
    const query = raw.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
    if ([...query].length < 2) return [];
    const { data: membershipRows, error: membershipError } = await this.repository.listConversationIds(user.id);
    if (membershipError) this.error("No se pudo realizar la búsqueda.", 503, "MESSAGE_SEARCH_FAILED");
    const ids = [...new Set((membershipRows || []).map((item) => item.conversation_id))];
    if (!ids.length) return [];
    const { data, error } = await this.repository.searchMessages(ids, query, 30);
    if (error) this.error("No se pudo realizar la búsqueda.", 503, "MESSAGE_SEARCH_FAILED");
    const [conversations, senders] = await Promise.all([
      this.deps.getConversationSummary(user.id),
      Promise.all([...new Set((data || []).map((item) => item.sender_id))].map(id => this.deps.userProfile(id))),
    ]);
    const conversationMap = new Map(conversations.map((item) => [item.id, item]));
    const senderMap = new Map(senders.filter(Boolean).map((item) => [item.id, item]));
    return (data || []).map((message) => ({
      ...message, sender: senderMap.get(message.sender_id) || null,
      conversationTitle: conversationMap.get(message.conversation_id)?.displayTitle || "Conversación",
    }));
  }
}
