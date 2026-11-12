export class ContactRepository {
  constructor(apiClient) { this.api = apiClient; }
  search(query) { return this.api.request("users.search", { query }); }
  request(userId) { return this.api.request("contacts.request", { userId }); }
  list() { return this.api.request("contacts.list"); }
  respond(requestId, decision) { return this.api.request("contacts.respond", { requestId, decision }); }
  cancel(requestId) { return this.api.request("contacts.cancel", { requestId }); }
  remove(userId) { return this.api.request("contacts.remove", { userId }); }
  block(userId) { return this.api.request("users.block", { userId, blocked: true }); }
  unblock(userId) { return this.api.request("users.block", { userId, blocked: false }); }
  listBlocked() { return this.api.request("users.blocks.list"); }
}
