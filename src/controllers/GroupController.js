import { Conversation } from "../models/entities/Conversation.js";

export class GroupController {
  constructor(model, view) { this.model = model; this.view = view; }

  openCreate() {
    if (!this.model.state.user) return this.model.update({ modal: { type: "auth", mode: "login", title: "Inicia sesión" } });
    this.model.update({ modal: { type: "create-group", title: "Crear grupo" } });
    this.view.focusModal();
  }

  async create(form) {
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    const memberIds = [...form.querySelectorAll('input[name="memberIds"]:checked')].map((input) => input.value);
    if (title.length < 2 || !memberIds.length) return this.view.showModalError("Indica un nombre y selecciona al menos un contacto.");
    this.view.setSubmitBusy(form, true, "Creando grupo…");
    try {
      const result = await this.model.groups.create(title, description, memberIds);
      this.model.update({ modal: null });
      await this.model.loadConversations();
      const conversation = this.model.state.conversations.find((item) => item.id === result.conversationId);
      if (conversation) await this.model.openConversation(conversation);
      this.view.toast("Grupo creado.");
    } catch (error) { this.view.showModalError(error.message); }
    finally { this.view.setSubmitBusy(form, false); }
  }

  async openManager() {
    const conversation = this.model.state.activeConversation;
    if (!conversation || conversation.kind !== "group") return;
    this.model.update({ modal: { type: "group-manager", title: "Administrar grupo" }, groupLoading: true });
    this.view.focusModal();
    try {
      const members = await this.model.groups.members(conversation.id);
      const updated = new Conversation({ ...conversation, members });
      this.model.update({ activeConversation: updated, groupLoading: false });
    } catch (error) {
      this.model.update({ groupLoading: false });
      this.view.toast(error.message, "error");
    }
  }

  async refreshActive() {
    const current = this.model.state.activeConversation;
    if (!current) return;
    await this.model.loadConversations();
    const updated = this.model.state.conversations.find((item) => item.id === current.id);
    if (!updated) {
      this.model.update({ activeConversation: null, messages: [], modal: null, detailsOpen: false });
      return;
    }
    const members = updated.kind === "group" ? await this.model.groups.members(updated.id) : updated.members;
    this.model.update({ activeConversation: new Conversation({ ...updated, members }) });
  }

  async update(form) {
    const conversation = this.model.state.activeConversation;
    if (!conversation) return;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    this.view.setSubmitBusy(form, true, "Guardando…");
    try {
      await this.model.groups.update(conversation.id, title, description);
      await this.refreshActive();
      this.view.toast("Información del grupo actualizada.");
    } catch (error) { this.view.showModalError(error.message); }
    finally { this.view.setSubmitBusy(form, false); }
  }

  async uploadAvatar(form) {
    const conversation = this.model.state.activeConversation;
    const file = new FormData(form).get("avatar");
    if (!conversation || !(file instanceof File) || !file.size) return this.view.showModalError("Selecciona una fotografía.");
    this.view.setSubmitBusy(form, true, "Subiendo…");
    try {
      await this.model.groups.uploadAvatar(conversation.id, file);
      await this.refreshActive();
      this.view.toast("Fotografía del grupo actualizada.");
    } catch (error) { this.view.showModalError(error.message); }
    finally { this.view.setSubmitBusy(form, false); }
  }

  async deleteAvatar() {
    const conversation = this.model.state.activeConversation;
    if (!conversation) return;
    try {
      await this.model.groups.deleteAvatar(conversation.id);
      await this.refreshActive();
      this.view.toast("Fotografía eliminada.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async addMember(form) {
    const conversation = this.model.state.activeConversation;
    const userId = String(new FormData(form).get("userId") || "");
    if (!conversation || !userId) return this.view.showModalError("Selecciona un contacto.");
    this.view.setSubmitBusy(form, true, "Agregando…");
    try {
      await this.model.groups.addMember(conversation.id, userId);
      await this.refreshActive();
      await this.model.loadConversations();
      this.view.toast("Participante agregado.");
    } catch (error) { this.view.showModalError(error.message); }
    finally { this.view.setSubmitBusy(form, false); }
  }

  async removeMember(userId) {
    const conversation = this.model.state.activeConversation;
    if (!conversation) return;
    try {
      await this.model.groups.removeMember(conversation.id, userId);
      await this.refreshActive();
      this.view.toast(userId === this.model.state.user?.id ? "Saliste del grupo." : "Participante retirado.");
      if (userId === this.model.state.user?.id) this.model.update({ modal: null, detailsOpen: false });
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async setRole(userId, role) {
    const conversation = this.model.state.activeConversation;
    if (!conversation) return;
    try {
      await this.model.groups.setRole(conversation.id, userId, role);
      await this.refreshActive();
      this.view.toast(role === "admin" ? "Administrador asignado." : "Permiso de administrador retirado.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }
}
