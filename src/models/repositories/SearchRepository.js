export class SearchRepository {
  constructor(apiClient) { this.api = apiClient; }
  conversations(query) { return this.api.request("conversations.search", { query }); }
  messages(query) { return this.api.request("search.messages", { query }); }
}
