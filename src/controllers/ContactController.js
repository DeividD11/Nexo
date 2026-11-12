export class ContactController {
  constructor(model, view) { this.model = model; this.view = view; this.lastResults = []; }

  open() {
    if (!this.model.state.user) return this.model.update({ modal: { type: "auth", mode: "login", title: "Inicia sesión" } });
    this.model.update({ modal: { type: "new-chat", title: "Buscar personas" } });
    this.view.focusModal();
  }

  async openManager(tab = "contacts") {
    if (!this.model.state.user) return this.model.update({ modal: { type: "auth", mode: "login", title: "Inicia sesión" } });
    this.model.update({ modal: { type: "contacts", title: "Contactos" }, contactTab: tab, accountLoading: true });
    this.view.focusModal();
    try {
      await this.model.loadAccountData();
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async search(form) {
    const query = String(new FormData(form).get("query") || "").trim();
    if (query.length < 2) return this.view.renderContactResults([], "Escribe al menos 2 caracteres para buscar.");
    this.view.renderContactResults([], "Buscando personas…");
    this.view.setSubmitBusy(form, true, "Buscando…");
    try {
      this.lastResults = await this.model.contacts.search(query);
      this.view.renderContactResults(this.lastResults);
    } catch (error) {
      this.view.renderContactResults([], error.message);
    } finally { this.view.setSubmitBusy(form, false); }
  }

  async add(userId) {
    try {
      const result = await this.model.contacts.request(userId);
      this.view.toast(result?.status === "accepted" ? "Ahora están en contactos." : "Solicitud de contacto enviada.");
      this.lastResults = this.lastResults.filter((item) => item.id !== userId);
      await this.model.loadAccountData().catch(() => {});
      this.view.renderContactResults(this.lastResults, this.lastResults.length ? "" : "No hay más resultados.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async respond(requestId, decision) {
    try {
      await this.model.contacts.respond(requestId, decision);
      await this.model.loadAccountData();
      this.view.root.querySelector(".modal-card")?.focus();
      this.view.toast(decision === "accept" ? "Solicitud aceptada." : "Solicitud rechazada.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async cancel(requestId) {
    try {
      await this.model.contacts.cancel(requestId);
      await this.model.loadAccountData();
      this.view.root.querySelector(".modal-card")?.focus();
      this.view.toast("Solicitud cancelada.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async remove(userId) {
    try {
      await this.model.contacts.remove(userId);
      await this.model.loadAccountData();
      this.view.root.querySelector(".modal-card")?.focus();
      this.view.toast("Contacto eliminado.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async block(userId) {
    try {
      await this.model.contacts.block(userId);
      await this.model.loadAccountData();
      this.view.root.querySelector(".modal-card")?.focus();
      this.view.toast("Usuario bloqueado.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async unblock(userId) {
    try {
      await this.model.contacts.unblock(userId);
      await this.model.loadAccountData();
      this.view.root.querySelector(".modal-card")?.focus();
      this.view.toast("Usuario desbloqueado.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async startConversation(userId) {
    try {
      const result = await this.model.conversations.create(userId);
      await this.model.loadConversations();
      const conversation = this.model.state.conversations.find((item) => item.id === result.conversationId);
      this.model.update({ modal: null });
      if (conversation) await this.model.openConversation(conversation);
      this.view.toast("Conversación abierta.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }
}
