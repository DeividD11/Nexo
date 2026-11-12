export class Router {
  constructor(model, authController) { this.model = model; this.auth = authController; }
  start() {
    window.addEventListener("hashchange", () => this.resolve());
    if (!location.hash) location.hash = "#/app";
    this.resolve();
  }
  resolve() {
    const route = location.hash.replace(/^#\/?/, "") || "app";
    if (route === "login" || route === "register") {
      this.auth.open(route);
      this.model.update({ route: "app" });
      history.replaceState(null, "", "#/app");
      return;
    }
    this.model.update({ route: "app" });
  }
}
