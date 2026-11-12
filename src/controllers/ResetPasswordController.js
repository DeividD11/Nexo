export class ResetPasswordController {
  constructor(model, view) { this.model = model; this.view = view; this.token = ""; }

  mount() {
    this.token = new URLSearchParams(window.location.search).get("token") || "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(this.token)) {
      this.view.render("invalid");
      return;
    }
    this.view.render("form");
    this.view.root.addEventListener("submit", (event) => this.onSubmit(event));
  }

  async onSubmit(event) {
    const form = event.target.closest('form[data-form="reset-password"]');
    if (!form) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.password !== data.confirmPassword) {
      this.view.render("form", "Las contraseñas no coinciden.");
      this.view.focusField("confirmPassword");
      return;
    }
    if ([...data.password].length < 10 || [...data.password].length > 128) {
      this.view.render("form", "La contraseña debe tener entre 10 y 128 caracteres.");
      this.view.focusField("password");
      return;
    }
    this.view.setBusy(form, true);
    try {
      await this.model.reset(this.token, data.password);
      this.view.render("success");
    } catch (error) {
      this.view.render("form", error.message || "No se pudo actualizar la contraseña.");
    }
  }
}
