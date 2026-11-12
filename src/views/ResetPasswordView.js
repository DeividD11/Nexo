import { escapeHtml, icon } from "../utils/dom.js";

export class ResetPasswordView {
  constructor(root) { this.root = root; }

  render(mode = "form", error = "") {
    let content = "";
    if (mode === "success") {
      content = `<div class="reset-result"><span class="reset-result__icon">${icon("check", 25)}</span><h1>Contraseña actualizada</h1><p>Tu contraseña se cambió correctamente. Ya puedes volver a Nexo e iniciar sesión.</p><a class="button button--primary button--full" href="./index.html#/login">Ir a iniciar sesión</a></div>`;
    } else if (mode === "invalid") {
      content = `<div class="reset-result"><span class="reset-result__icon reset-result__icon--muted">${icon("alert", 25)}</span><h1>Enlace no disponible</h1><p>El enlace no contiene un token válido. Solicita uno nuevo desde la pantalla de inicio de sesión.</p><a class="button button--primary button--full" href="./index.html#/login">Volver a Nexo</a></div>`;
    } else {
      content = `<div class="reset-heading"><span class="eyebrow">SEGURIDAD DE LA CUENTA</span><h1>Elige una nueva contraseña</h1><p>Usa al menos 10 caracteres. El enlace solo se puede utilizar una vez.</p></div>
        <form class="form-stack" data-form="reset-password" novalidate>
          <label class="field"><span>Nueva contraseña</span><input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="Mínimo 10 caracteres" required></label>
          <label class="field"><span>Repite la contraseña</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="Confirma tu contraseña" required></label>
          <p class="reset-error" role="alert" ${error ? "" : "hidden"}>${escapeHtml(error)}</p>
          <button class="button button--primary button--full" type="submit">Guardar contraseña</button>
        </form>
        <a class="reset-back-link" href="./index.html#/login">Volver a Nexo</a>`;
    }
    this.root.innerHTML = `<main class="reset-page"><a class="reset-brand" href="./index.html"><span class="brand-mark">n</span><span>nexo<span class="brand-dot">.</span></span></a><section class="reset-card">${content}</section><p class="reset-footnote">${icon("lock", 14)} Tu solicitud se valida de forma segura en el servidor.</p></main>`;
  }

  focusField(name) {
    this.root.querySelector(`[name="${name}"]`)?.focus();
  }

  setBusy(form, busy) {
    const button = form?.querySelector('button[type="submit"]');
    if (!button) return;
    if (busy) { button.dataset.label = button.textContent; button.disabled = true; button.textContent = "Guardando…"; }
    else { button.disabled = false; button.textContent = button.dataset.label || "Guardar contraseña"; }
  }
}
