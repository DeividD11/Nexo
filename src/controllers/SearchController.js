export class SearchController {
  constructor(model, view) { this.model = model; this.view = view; }

  async search(form) {
    const query = String(new FormData(form).get("query") || "").trim();
    if (query.length < 2) return this.view.toast("Escribe al menos 2 caracteres para buscar.", "error");
    this.model.update({ modal: { type: "search-results", title: `Resultados: ${query}`, query, searchLoading: true } });
    this.view.focusModal();
    try {
      const [conversations, messages] = await Promise.all([
        this.model.search.conversations(query),
        this.model.search.messages(query),
      ]);
      this.model.update({ modal: { type: "search-results", title: `Resultados: ${query}`, query, searchLoading: false, conversationResults: conversations, messageResults: messages } });
    } catch (error) {
      this.model.update({ modal: { type: "search-results", title: "Búsqueda", query, searchLoading: false, searchError: error.message, conversationResults: [], messageResults: [] } });
    }
  }

  async openConversation(conversationId) {
    const conversation = this.model.state.conversations.find((item) => item.id === conversationId)
      || this.model.state.modal?.conversationResults?.find((item) => item.id === conversationId);
    if (!conversation) return;
    this.model.update({ modal: null });
    await this.model.openConversation(conversation);
  }

  async openMessage(result) {
    const conversationId = result.conversation_id;
    await this.openConversation(conversationId);
    if (!this.model.state.activeConversation || this.model.state.activeConversation.id !== conversationId) return;
    let pages = 0;
    while (!this.model.state.messages.some((message) => message.id === result.id) && this.model.state.messagesHasMore && pages < 20) {
      const previousLength = this.model.state.messages.length;
      await this.model.loadEarlierMessages({ mode: "height-delta", scrollTop: 0, scrollHeight: 0 });
      if (this.model.state.messages.length === previousLength) break;
      pages += 1;
    }
    this.view.scrollToMessage(result.id);
  }
}
