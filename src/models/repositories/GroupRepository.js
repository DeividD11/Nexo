export class GroupRepository {
  constructor(apiClient) { this.api = apiClient; }
  create(title, description, memberIds) {
    return this.api.request("groups.create", { title, description, memberIds });
  }
  update(conversationId, title, description) {
    return this.api.request("groups.update", { conversationId, title, description });
  }
  members(conversationId) { return this.api.request("groups.members", { conversationId }); }
  addMember(conversationId, userId) { return this.api.request("groups.add-member", { conversationId, userId }); }
  removeMember(conversationId, userId) { return this.api.request("groups.remove-member", { conversationId, userId }); }
  setRole(conversationId, userId, role) { return this.api.request("groups.set-role", { conversationId, userId, role }); }
  uploadAvatar(conversationId, file) {
    const form = new FormData();
    form.set("action", "groups.avatar.upload");
    form.set("conversationId", conversationId);
    form.set("file", file, file.name || "group-avatar");
    return this.api.requestMultipart(form);
  }
  deleteAvatar(conversationId) { return this.api.request("groups.avatar.delete", { conversationId }); }
}
