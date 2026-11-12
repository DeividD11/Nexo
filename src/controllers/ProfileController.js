import { User } from "../models/entities/User.js";

export class ProfileController {
  constructor(model, view) { this.model = model; this.view = view; }

  async open() {
    if (!this.model.state.user) return;
    try {
      const profile = await this.model.profile.get();
      this.model.update({ user: new User(profile), modal: { type: "profile", title: "Mi perfil" }, error: "" });
      this.view.focusModal();
    } catch (error) {
      this.view.toast(error.message || "No se pudo cargar el perfil.", "error");
    }
  }

  async submit(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    this.view.setSubmitBusy(form, true, "Guardando…");
    try {
      const profile = await this.model.profile.update({
        username: String(data.username || "").trim(),
        displayName: String(data.displayName || "").trim(),
        bio: String(data.bio || "").trim(),
      });
      this.model.update({ user: new User(profile), modal: null });
      this.view.toast("Tu perfil se actualizó correctamente.");
    } catch (error) {
      this.view.showModalError(error.message);
      this.view.setSubmitBusy(form, false);
    }
  }

  async uploadAvatar(form) {
    const file = form.querySelector('input[name="avatar"]')?.files?.[0];
    if (!file) return this.view.showModalError("Selecciona una fotografía antes de continuar.");
    if (file.size > 5 * 1024 * 1024) return this.view.showModalError("La fotografía debe pesar como máximo 5 MB.");
    this.view.setSubmitBusy(form, true, "Subiendo fotografía…");
    try {
      await this.model.profile.uploadAvatar(file);
      await this.model.refreshProfile();
      this.view.toast("Fotografía actualizada.");
      this.model.update({ modal: { type: "profile", title: "Mi perfil" } });
      this.view.focusModal();
    } catch (error) {
      this.view.showModalError(error.message);
      this.view.setSubmitBusy(form, false);
    }
  }

  async deleteAvatar() {
    try {
      await this.model.profile.deleteAvatar();
      await this.model.refreshProfile();
      this.model.update({ modal: { type: "profile", title: "Mi perfil" } });
      this.view.toast("Fotografía eliminada.");
      this.view.focusModal();
    } catch (error) {
      this.view.showModalError(error.message);
    }
  }
}
