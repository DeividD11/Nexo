import { User } from "../models/entities/User.js";

export class AuthController {
  constructor(model, view) { this.model = model; this.view = view; }

  open(mode = "login") {
    const titles = { login: "Qué bueno verte", register: "Crea tu espacio", recover: "Recupera tu acceso" };
    this.model.update({ modal: { type: "auth", mode, title: titles[mode] || titles.login } });
    this.view.focusModal();
  }

  async submit(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const type = form.dataset.form;
    this.view.setSubmitBusy(form, true, type === "register" ? "Creando cuenta…" : type === "recover" ? "Enviando…" : "Verificando…");
    try {
      if (type === "login") {
        const sessionUser = await this.model.auth.login(data.identifier, data.password);
        let user;
        try { user = await this.model.refreshProfile(); }
        catch { user = new User(sessionUser); this.model.update({ user }); }
        this.model.update({ user, modal: null, error: "", activeConversation: null, messages: [] });
        this.view.toast(`Hola, ${user.displayName}. Ya estás dentro.`);
        await Promise.all([this.model.loadConversations(), this.model.loadAccountData().catch(() => {})]);
      } else if (type === "register") {
        const sessionUser = await this.model.auth.register({ email: data.email, username: data.username, displayName: data.displayName, password: data.password });
        let user;
        try { user = await this.model.refreshProfile(); }
        catch { user = new User(sessionUser); this.model.update({ user }); }
        this.model.update({ user, modal: null, error: "" });
        this.view.toast("Tu cuenta se creó correctamente.");
        await Promise.all([this.model.loadConversations(), this.model.loadAccountData().catch(() => {})]);
      } else if (type === "recover") {
        const result = await this.model.auth.recover(data.email);
        this.model.update({ modal: null });
        this.view.toast(result.message || "Si la cuenta existe, recibirás instrucciones.");
      }
    } catch (error) {
      this.view.showModalError(error.message);
      this.view.setSubmitBusy(form, false);
    }
  }

  async logout() {
    try {
      await this.model.auth.logout();
      this.model.update({
        user: null, conversations: [], activeConversation: null, messages: [], contacts: [],
        incomingRequests: [], outgoingRequests: [], blockedUsers: [], modal: null,
      });
      this.view.toast("Has cerrado tu sesión.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }
}
