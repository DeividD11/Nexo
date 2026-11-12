import { escapeHtml, icon } from "../../utils/dom.js";
import { renderAvatar } from "./Avatar.js";


function deviceSessionLabel(session) {
  const raw = String(session.device_label || session.deviceLabel || "").trim();
  if (raw && !/(?:Ã¯Â¿Â½|ï¿½|�)/u.test(raw)) {
    return raw.replace(/^Nexo web\s+-\s+/u, "Nexo web · ");
  }

  const agent = String(session.user_agent || session.userAgent || "");
  let platform = "Dispositivo";
  if (/Windows NT|Windows/i.test(agent)) platform = "Windows";
  else if (/Android/i.test(agent)) platform = "Android";
  else if (/iPhone|iPad|iPod/i.test(agent)) platform = "iOS";
  else if (/Macintosh|Mac OS/i.test(agent)) platform = "macOS";
  else if (/Linux/i.test(agent)) platform = "Linux";
  return `Nexo web · ${platform}`;
}

function renderAuth(mode) {
  if (mode === "recover") {
    return `
      <p class="modal-copy">Escribe el correo asociado a tu cuenta. Si existe, enviaremos instrucciones para recuperar el acceso.</p>
      <form class="form-stack" data-form="recover" novalidate>
        <label class="field"><span>Correo electrónico</span><input name="email" type="email" autocomplete="email" maxlength="254" placeholder="tu@correo.com" required></label>
        <button class="button button--primary button--full" type="submit">Enviar instrucciones</button>
      </form>
      <button class="text-button modal-switch" type="button" data-action="auth-mode" data-mode="login">Volver a iniciar sesión</button>`;
  }
  const register = mode === "register";
  return `
    <p class="modal-copy">${register ? "Crea tu cuenta para empezar a conversar." : "Entra a tu espacio y continúa tus conversaciones."}</p>
    <form class="form-stack" data-form="${register ? "register" : "login"}" novalidate>
      ${register ? `<label class="field"><span>Nombre visible</span><input name="displayName" autocomplete="name" maxlength="80" minlength="2" placeholder="Cómo te verán" required></label>` : ""}
      ${register ? `<label class="field"><span>Nombre de usuario</span><input name="username" autocomplete="username" maxlength="24" minlength="3" placeholder="tu_usuario" required></label>` : ""}
      <label class="field"><span>${register ? "Correo electrónico" : "Correo o usuario"}</span><input name="${register ? "email" : "identifier"}" type="${register ? "email" : "text"}" autocomplete="${register ? "email" : "username"}" maxlength="254" placeholder="${register ? "tu@correo.com" : "Correo o nombre de usuario"}" required></label>
      <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="10" maxlength="128" placeholder="${register ? "Mínimo 10 caracteres" : "Tu contraseña"}" required></label>
      <button class="button button--primary button--full" type="submit">${register ? "Crear cuenta" : "Iniciar sesión"}</button>
    </form>
    ${!register ? `<button class="text-button modal-switch" type="button" data-action="auth-mode" data-mode="recover">¿Olvidaste tu contraseña?</button>` : ""}
    <div class="modal-divider"><span>o</span></div>
    <p class="modal-footnote">${register ? "¿Ya tienes una cuenta?" : "¿Todavía no tienes cuenta?"} <button class="text-button" type="button" data-action="auth-mode" data-mode="${register ? "login" : "register"}">${register ? "Inicia sesión" : "Crear una cuenta"}</button></p>`;
}

function renderNewChat() {
  return `
    <p class="modal-copy">Busca por nombre de usuario o nombre visible. Por privacidad, las cuentas no se buscan por correo electrónico.</p>
    <form class="search-form" data-form="contact-search">
      <label class="sr-only" for="contact-search-input">Buscar personas</label>
      <span class="search-form__icon">${icon("search", 18)}</span>
      <input id="contact-search-input" name="query" type="search" minlength="2" maxlength="60" placeholder="Buscar personas…" autocomplete="off" required>
      <button class="button button--primary button--small" type="submit">Buscar</button>
    </form>
    <div class="search-results" id="contact-search-results" aria-live="polite"><div class="results-hint">Escribe al menos 2 caracteres para buscar.</div></div>`;
}

function renderProfile(state) {
  const user = state.user || {};
  return `
    <p class="modal-copy">Esta información forma parte de tu perfil visible para las personas que encuentren tu cuenta o te tengan como contacto. Tu correo no se muestra a otros usuarios.</p>
    <div class="profile-editor-avatar">
      ${renderAvatar(user.displayName, user.avatarUrl || user.avatarPath, "large")}
      <div><strong>Fotografía de perfil</strong><span>JPG, PNG, WEBP o GIF · máximo 5 MB</span></div>
    </div>
    <form class="profile-avatar-form" data-form="profile-avatar">
      <label class="field"><span>Seleccionar fotografía</span><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label>
      <div class="profile-avatar-actions"><button class="button button--outline button--small" type="submit">Subir fotografía</button><button class="text-button danger-text" type="button" data-action="delete-avatar" ${user.avatarUrl ? "" : "disabled"}>Eliminar</button></div>
    </form>
    <div class="modal-divider"><span>Información personal</span></div>
    <form class="form-stack" data-form="profile-update" novalidate>
      <label class="field"><span>Nombre visible</span><input name="displayName" autocomplete="name" minlength="2" maxlength="80" value="${escapeHtml(user.displayName || "")}" required></label>
      <label class="field"><span>Nombre de usuario</span><input name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[a-z0-9_.]{3,24}" value="${escapeHtml(user.username || "")}" required><small>Entre 3 y 24 caracteres: letras minúsculas, números, punto y guion bajo.</small></label>
      <label class="field"><span>Biografía</span><textarea name="bio" rows="3" maxlength="300" placeholder="Cuéntales algo sobre ti">${escapeHtml(user.bio || "")}</textarea><small>Máximo 300 caracteres.</small></label>
      <label class="field"><span>Correo electrónico</span><input type="email" value="${escapeHtml(user.email || "")}" disabled><small>El correo no se puede cambiar desde esta pantalla.</small></label>
      <button class="button button--primary button--full" type="submit">Guardar cambios</button>
    </form>`;
}

function renderContactRow(user, actions) {
  if (!user) return "";
  return `<div class="account-list-row">
    ${renderAvatar(user.displayName || user.username, user.avatarUrl, "medium")}
    <span class="account-list-row__identity"><strong>${escapeHtml(user.displayName || user.username)}</strong><small>@${escapeHtml(user.username || "usuario")}</small>${user.online ? `<small class="online-label">En línea</small>` : ""}</span>
    <span class="account-list-row__actions">${actions}</span>
  </div>`;
}

function renderContactsManager(state) {
  const tab = state.contactTab || "contacts";
  const contacts = state.contacts || [];
  const incoming = state.incomingRequests || [];
  const outgoing = state.outgoingRequests || [];
  const blocked = state.blockedUsers || [];
  let body = "";
  if (state.accountLoading) {
    body = `<div class="account-empty" role="status"><span class="loading-spinner"></span><strong>Cargando tus relaciones…</strong></div>`;
  } else if (tab === "contacts") {
    body = contacts.length ? contacts.map((user) => renderContactRow(user,
      `<button class="button button--outline button--small" type="button" data-action="message-contact" data-id="${escapeHtml(user.id)}">Conversar</button><button class="icon-button" type="button" data-action="remove-contact" data-id="${escapeHtml(user.id)}" aria-label="Eliminar contacto">${icon("close", 16)}</button><button class="icon-button" type="button" data-action="block-user" data-id="${escapeHtml(user.id)}" aria-label="Bloquear usuario">${icon("lock", 16)}</button>`)).join("")
      : `<div class="account-empty"><span class="empty-icon">${icon("users", 22)}</span><strong>Aún no tienes contactos</strong><p>Busca personas y envíales una solicitud para empezar a conectar.</p><button class="button button--primary button--small" type="button" data-action="new-chat">Buscar personas</button></div>`;
  } else if (tab === "requests") {
    body = `${incoming.length ? `<h3 class="account-list-heading">Solicitudes recibidas</h3>${incoming.map((request) => renderContactRow(request.user, `<button class="button button--primary button--small" type="button" data-action="respond-contact" data-decision="accept" data-id="${escapeHtml(request.id)}">Aceptar</button><button class="button button--outline button--small" type="button" data-action="respond-contact" data-decision="reject" data-id="${escapeHtml(request.id)}">Rechazar</button>`)).join("")}` : ""}
      ${outgoing.length ? `<h3 class="account-list-heading">Solicitudes enviadas</h3>${outgoing.map((request) => renderContactRow(request.user, `<button class="button button--outline button--small" type="button" data-action="cancel-contact" data-id="${escapeHtml(request.id)}">Cancelar</button>`)).join("")}` : ""}
      ${!incoming.length && !outgoing.length ? `<div class="account-empty"><span class="empty-icon">${icon("mail", 22)}</span><strong>No tienes solicitudes pendientes</strong><p>Las solicitudes nuevas aparecerán aquí.</p></div>` : ""}`;
  } else {
    body = blocked.length ? blocked.map((user) => renderContactRow(user,
      `<button class="button button--outline button--small" type="button" data-action="unblock-user" data-id="${escapeHtml(user.id)}">Desbloquear</button>`)).join("")
      : `<div class="account-empty"><span class="empty-icon">${icon("shield", 22)}</span><strong>No has bloqueado a nadie</strong><p>Los usuarios que bloquees aparecerán aquí.</p></div>`;
  }

  return `
    <p class="modal-copy">Administra tus contactos, solicitudes y usuarios bloqueados. Las acciones se validan en el servidor.</p>
    <div class="account-tabs" role="tablist" aria-label="Administrar contactos">
      <button type="button" role="tab" aria-selected="${tab === "contacts"}" class="${tab === "contacts" ? "is-active" : ""}" data-action="contacts-tab" data-tab="contacts">Contactos <span>${contacts.length}</span></button>
      <button type="button" role="tab" aria-selected="${tab === "requests"}" class="${tab === "requests" ? "is-active" : ""}" data-action="contacts-tab" data-tab="requests">Solicitudes <span>${incoming.length + outgoing.length}</span></button>
      <button type="button" role="tab" aria-selected="${tab === "blocked"}" class="${tab === "blocked" ? "is-active" : ""}" data-action="contacts-tab" data-tab="blocked">Bloqueados <span>${blocked.length}</span></button>
    </div>
    <div class="account-list" aria-live="polite">${body}</div>
    <div class="account-manager-footer"><button class="button button--primary button--small" type="button" data-action="new-chat">${icon("plus", 16)} Buscar personas</button></div>`;
}


function renderCreateGroup(state) {
  const contacts = state.contacts || [];
  return `
    <p class="modal-copy">Crea un espacio grupal con tus contactos. Todos los participantes se validan nuevamente en el servidor antes de crear el grupo.</p>
    <form class="form-stack" data-form="group-create" novalidate>
      <label class="field"><span>Nombre del grupo</span><input name="title" minlength="2" maxlength="80" placeholder="Ej. Amigos del barrio" required></label>
      <label class="field"><span>Descripción (opcional)</span><textarea name="description" rows="2" maxlength="300" placeholder="¿De qué trata este grupo?"></textarea></label>
      <div class="group-picker"><div class="group-picker__heading"><strong>Invitar contactos</strong><span>${contacts.length} disponibles</span></div>
        ${contacts.length ? `<div class="group-picker__list">${contacts.map((contact) => `<label class="group-picker__item">${renderAvatar(contact.displayName || contact.username, contact.avatarUrl, "small")}<span><strong>${escapeHtml(contact.displayName || contact.username)}</strong><small>@${escapeHtml(contact.username || "usuario")}</small></span><input type="checkbox" name="memberIds" value="${escapeHtml(contact.id)}" aria-label="Invitar a ${escapeHtml(contact.displayName || contact.username)}"></label>`).join("")}</div>` : `<div class="results-hint">Necesitas al menos un contacto aceptado para crear un grupo.</div>`}
      </div>
      <button class="button button--primary button--full" type="submit" ${contacts.length ? "" : "disabled"}>Crear grupo</button>
    </form>`;
}

function renderGroupManager(state) {
  const conversation = state.activeConversation || {};
  const members = conversation.members || [];
  const contacts = state.contacts || [];
  const role = conversation.myRole || "member";
  const canManage = ["owner", "admin"].includes(role);
  const isOwner = role === "owner";
  const memberIds = new Set(members.map((member) => member.id));
  const invitees = contacts.filter((contact) => !memberIds.has(contact.id));
  return `
    <div class="group-manager-summary"><div class="group-avatar-preview">${renderAvatar(conversation.title, conversation.avatarUrl || conversation.avatarPath, "large")}</div><div><strong>${escapeHtml(conversation.title || "Grupo")}</strong><span>${members.length} integrantes · Tu rol: ${role === "owner" ? "Propietario" : role === "admin" ? "Administrador" : "Miembro"}</span></div></div>
    ${canManage ? `<form class="form-stack group-manager-block" data-form="group-update"><label class="field"><span>Nombre del grupo</span><input name="title" minlength="2" maxlength="80" value="${escapeHtml(conversation.title || "")}" required></label><label class="field"><span>Descripción</span><textarea name="description" rows="2" maxlength="300">${escapeHtml(conversation.description || "")}</textarea></label><button class="button button--outline button--small" type="submit">Guardar información</button></form>
    <form class="group-avatar-form group-manager-block" data-form="group-avatar"><label class="field"><span>Fotografía del grupo</span><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp,image/gif" required><small>JPG, PNG, WEBP o GIF · máximo 5 MB.</small></label><div class="profile-avatar-actions"><button class="button button--outline button--small" type="submit">Subir fotografía</button><button class="text-button danger-text" type="button" data-action="delete-group-avatar" ${conversation.avatarUrl || conversation.avatarPath ? "" : "disabled"}>Eliminar</button></div></form>` : `<p class="modal-copy">Solo el propietario y los administradores pueden cambiar los datos del grupo o invitar participantes.</p>`}
    ${canManage && invitees.length ? `<form class="group-add-form group-manager-block" data-form="group-add-member"><label class="field"><span>Agregar contacto</span><select name="userId" required><option value="">Selecciona una persona</option>${invitees.map((contact) => `<option value="${escapeHtml(contact.id)}">${escapeHtml(contact.displayName || contact.username)} · @${escapeHtml(contact.username || "usuario")}</option>`).join("")}</select></label><button class="button button--outline button--small" type="submit">Agregar participante</button></form>` : canManage ? `<p class="subtle-copy group-manager-block">No tienes contactos disponibles para invitar.</p>` : ""}
    <div class="group-manager-block"><div class="group-picker__heading"><strong>Integrantes</strong><span>${members.length}</span></div><div class="group-member-list">${members.map((member) => {
      const targetIsOwner = member.role === "owner";
      const canRemove = canManage && !targetIsOwner && (isOwner || member.role === "member");
      const canChangeRole = isOwner && member.id !== state.user?.id && !targetIsOwner;
      const label = member.role === "owner" ? "Propietario" : member.role === "admin" ? "Administrador" : "Miembro";
      return `<div class="group-member-item">${renderAvatar(member.displayName || member.username, member.avatarUrl || member.avatarPath, "small")}<span><strong>${escapeHtml(member.displayName || member.username)}</strong><small>@${escapeHtml(member.username || "usuario")} · ${label}</small></span><span class="group-member-actions">${canChangeRole ? `<button class="text-button" type="button" data-action="group-set-role" data-id="${escapeHtml(member.id)}" data-role="${member.role === "admin" ? "member" : "admin"}">${member.role === "admin" ? "Quitar admin" : "Hacer admin"}</button>` : ""}${canRemove ? `<button class="icon-button danger-text" type="button" data-action="group-remove-member" data-id="${escapeHtml(member.id)}" aria-label="Retirar a ${escapeHtml(member.displayName || member.username)}">${icon("user-minus", 16)}</button>` : ""}</span></div>`;
    }).join("")}</div></div>
    <div class="group-manager-footer"><button class="text-button danger-text" type="button" data-action="group-leave">${isOwner ? "Salir y transferir propiedad" : "Salir del grupo"}</button></div>`;
}


function renderSettings(state) {
  const settings = state.settings || {};
  const sessions = state.deviceSessions || [];
  const sessionsBody = state.sessionsLoading
    ? `<div class="account-empty" role="status"><span class="loading-spinner"></span><strong>Cargando sesiones…</strong></div>`
    : state.sessionsError
      ? `<div class="account-empty" role="alert"><strong>No se pudieron cargar los dispositivos</strong><small>${escapeHtml(state.sessionsError)}</small><button type="button" class="button button--outline button--small" data-action="refresh-device-sessions">Reintentar</button></div>`
      : sessions.length
        ? `<div class="device-session-list">${sessions.map((session) => `<div class="device-session-row"><span class="device-session-icon">${icon("monitor", 18)}</span><span class="device-session-info"><span class="device-session-heading"><strong>${escapeHtml(deviceSessionLabel(session))}</strong>${session.current ? `<em class="session-current-badge">Esta sesión</em>` : ""}</span><small>${escapeHtml(session.user_agent || session.userAgent || "Navegador")}</small><small>Última actividad: ${escapeHtml(session.last_seen_at ? new Date(session.last_seen_at).toLocaleString("es-CO") : "Sin datos")}</small></span>${session.current ? "" : `<button type="button" class="text-button danger-text" data-action="revoke-device-session" data-id="${escapeHtml(session.id)}">Cerrar</button>`}</div>`).join("")}</div>`
        : `<div class="account-empty"><strong>No hay sesiones activas</strong></div>`;
  return `
    <p class="modal-copy">Administra la apariencia, las alertas y los dispositivos conectados a tu cuenta.</p>
    <form class="form-stack settings-form" data-form="settings-update">
      <label class="field"><span>Tema</span><select name="theme"><option value="system" ${(settings.theme || state.themePreference) === "system" ? "selected" : ""}>Automático del dispositivo</option><option value="light" ${(settings.theme || state.themePreference) === "light" ? "selected" : ""}>Claro</option><option value="dark" ${(settings.theme || state.themePreference) === "dark" ? "selected" : ""}>Oscuro</option></select></label>
      <div class="settings-toggle-list">
        <label class="settings-toggle"><span><strong>Notificaciones dentro de Nexo</strong><small>Mostrar avisos cuando llegue nueva actividad.</small></span><input type="checkbox" name="inAppNotifications" ${settings.in_app_notifications !== false ? "checked" : ""}></label>
        <label class="settings-toggle"><span><strong>Notificaciones del escritorio</strong><small>Requiere permiso del navegador.</small></span><input type="checkbox" name="desktopNotifications" ${settings.desktop_notifications ? "checked" : ""}></label>
        <label class="settings-toggle"><span><strong>Vista previa de mensajes</strong><small>Mostrar el contenido en las notificaciones.</small></span><input type="checkbox" name="messagePreviews" ${settings.message_previews !== false ? "checked" : ""}></label>
        <label class="settings-toggle"><span><strong>Sonido de notificación</strong><small>Reproducir un tono breve al recibir avisos.</small></span><input type="checkbox" name="soundNotifications" ${settings.sound_notifications ? "checked" : ""}></label>
      </div>
      <button class="button button--primary button--full" type="submit">Guardar preferencias</button>
    </form>
    <div class="modal-divider"><span>Dispositivos y sesiones</span></div>
    <p class="modal-copy">Cada sesión corresponde a un inicio de sesión de tu cuenta. Puedes cerrar las sesiones que ya no reconozcas.</p>
    ${sessionsBody}
    ${sessions.some((session) => !session.current) ? `<button type="button" class="button button--outline button--full" data-action="revoke-other-sessions">Cerrar todas las demás sesiones</button>` : ""}
    <div class="setting-row"><div><strong>Seguridad de la cuenta</strong><span>Los archivos, conversaciones y preferencias se consultan mediante tu sesión validada en el servidor.</span></div>${icon("shield-check", 22)}</div>`;
}

function renderNotifications(state) {
  const items = state.notifications || [];
  if (state.notificationLoading) return `<div class="account-empty" role="status"><span class="loading-spinner"></span><strong>Cargando notificaciones…</strong></div>`;
  const body = items.length
    ? `<div class="notification-list">${items.map((item) => {
      const showBody = state.settings?.message_previews !== false || item.kind !== "new_message";
      return `<article class="notification-row ${item.read_at ? "is-read" : "is-unread"}"><span class="notification-mark">${icon(item.kind === "new_message" ? "message" : item.kind.includes("contact") ? "users" : "bell", 17)}</span><div class="notification-content"><strong>${escapeHtml(item.title || "Notificación")}</strong>${showBody && item.body ? `<p>${escapeHtml(item.body)}</p>` : ""}<time>${escapeHtml(item.created_at ? new Date(item.created_at).toLocaleString("es-CO") : "")}</time></div>${!item.read_at ? `<button type="button" class="text-button" data-action="mark-notification-read" data-id="${escapeHtml(item.id)}">Marcar leída</button>` : `<span class="notification-read-label">Leída</span>`}</article>`;
    }).join("")}</div>`
    : `<div class="account-empty"><span class="empty-icon">${icon("bell", 22)}</span><strong>No tienes notificaciones</strong><p>Las solicitudes y los nuevos mensajes aparecerán aquí.</p></div>`;
  return `<p class="modal-copy">Avisos de actividad asociados a tu cuenta. Solo tú puedes consultar tus notificaciones.</p>${items.some((item) => !item.read_at) ? `<div class="notification-toolbar"><span>${state.unreadNotificationCount || 0} sin leer</span><button type="button" class="text-button" data-action="notifications-read-all">Marcar todas como leídas</button></div>` : ""}${body}`;
}

function renderSearchResults(modal) {
  if (modal.searchLoading) return `<div class="account-empty" role="status"><span class="loading-spinner"></span><strong>Buscando en tus conversaciones…</strong></div>`;
  if (modal.searchError) return `<p class="form-error">${escapeHtml(modal.searchError)}</p>`;
  const conversations = modal.conversationResults || [];
  const messages = modal.messageResults || [];
  return `<p class="modal-copy">Resultados de conversaciones y mensajes a los que tu cuenta tiene acceso.</p>
    <h3 class="account-list-heading">Conversaciones (${conversations.length})</h3>
    ${conversations.length ? conversations.map((conversation) => `<button type="button" class="search-result-row" data-action="open-search-conversation" data-id="${escapeHtml(conversation.id)}"><span>${icon("users", 17)}</span><span><strong>${escapeHtml(conversation.displayTitle || conversation.title || "Conversación")}</strong><small>${escapeHtml(conversation.kind === "group" ? "Grupo" : "Conversación privada")}</small></span></button>`).join("") : `<p class="subtle-copy">No se encontraron conversaciones.</p>`}
    <h3 class="account-list-heading">Mensajes (${messages.length})</h3>
    ${messages.length ? messages.map((message) => `<button type="button" class="search-result-row" data-action="open-search-message" data-id="${escapeHtml(message.id)}"><span>${icon("message", 17)}</span><span><strong>${escapeHtml(message.conversationTitle || "Conversación")}</strong><small>${escapeHtml(message.sender?.displayName || message.sender?.username || "Usuario")} · ${escapeHtml(message.body || "Archivo adjunto")}</small><time>${escapeHtml(message.created_at ? new Date(message.created_at).toLocaleString("es-CO") : "")}</time></span></button>`).join("") : `<p class="subtle-copy">No se encontraron mensajes.</p>`}`;
}

function renderFilePreview(modal) {
  return `<div class="file-preview-modal"><img src="${escapeHtml(modal.fileUrl || "")}" alt="Vista previa de ${escapeHtml(modal.fileName || "imagen adjunta")}" loading="eager"><div class="file-preview-actions"><span>${escapeHtml(modal.fileName || "Imagen")}</span><a class="button button--outline button--small" href="${escapeHtml(modal.fileUrl || "")}" target="_blank" rel="noopener noreferrer">Abrir imagen</a></div></div>`;
}

function renderEditMessage(modal) {
  return `<p class="modal-copy">Puedes editar un mensaje propio durante los primeros 15 minutos desde su envío.</p><form class="form-stack" data-form="edit-message"><input type="hidden" name="messageId" value="${escapeHtml(modal.messageId || "")}"><label class="field"><span>Mensaje</span><textarea name="body" rows="4" maxlength="4000" required>${escapeHtml(modal.body || "")}</textarea></label><button class="button button--primary button--full" type="submit">Guardar edición</button></form>`;
}

function renderDeleteMessage(modal) {
  return `<p class="modal-copy">El mensaje se eliminará para todos los participantes. En el historial aparecerá una indicación de que fue eliminado.</p><div class="modal-confirm-actions"><button class="button button--outline" type="button" data-action="close-modal">Cancelar</button><button class="button button--danger" type="button" data-action="confirm-delete-message" data-id="${escapeHtml(modal.messageId || "")}">Eliminar para todos</button></div>`;
}

export function getModalInstanceKey(modal) {
  if (!modal?.type) return null;
  const identity = modal.type === "edit-message" || modal.type === "delete-message"
    ? modal.messageId || ""
    : modal.type === "file-preview"
      ? modal.fileUrl || modal.fileName || ""
      : "";
  return `${modal.type}:${identity}`;
}

/**
 * Only include state that is actually rendered inside the active modal.
 * Background sync updates therefore do not cause a modal body refresh.
 */
export function getModalRenderSignature(modal, state = {}) {
  if (!modal) return "";
  let dependencies;
  switch (modal.type) {
    case "auth":
      dependencies = [modal.mode];
      break;
    case "profile":
      dependencies = [state.user || null];
      break;
    case "contacts":
      dependencies = [state.contactTab, state.accountLoading, state.contacts, state.incomingRequests, state.outgoingRequests, state.blockedUsers];
      break;
    case "create-group":
      dependencies = [state.contacts];
      break;
    case "group-manager": {
      const conversation = state.activeConversation || {};
      dependencies = [
        state.groupLoading,
        conversation.id,
        conversation.title,
        conversation.avatarUrl,
        conversation.avatarPath,
        conversation.description,
        conversation.myRole,
        conversation.members,
        state.contacts,
        state.user?.id,
      ];
      break;
    }
    case "settings":
      dependencies = [state.settings, state.deviceSessions, state.sessionsLoading, state.themePreference];
      break;
    case "notifications":
      dependencies = [state.notifications, state.notificationLoading, state.unreadNotificationCount, state.settings?.message_previews];
      break;
    case "search-results":
      dependencies = [modal.query, modal.searchLoading, modal.searchError, modal.conversationResults, modal.messageResults];
      break;
    case "file-preview":
      dependencies = [modal.fileUrl, modal.fileName, modal.mimeType];
      break;
    case "edit-message":
      dependencies = [modal.messageId, modal.body];
      break;
    case "delete-message":
      dependencies = [modal.messageId];
      break;
    default:
      dependencies = [];
  }
  try {
    return JSON.stringify([modal.type, modal.title || "", dependencies]);
  } catch {
    return `${modal.type}:${modal.title || ""}:${dependencies.length}`;
  }
}

export function renderModal(modal, theme = "light", state = {}) {
  if (!modal) return "";
  const title = escapeHtml(modal.title || "Ventana");
  let content = "";

  if (modal.type === "auth") content = renderAuth(modal.mode || "login");
  else if (modal.type === "new-chat") content = renderNewChat();
  else if (modal.type === "profile") content = renderProfile(state);
  else if (modal.type === "contacts") content = renderContactsManager(state);
  else if (modal.type === "create-group") content = renderCreateGroup(state);
  else if (modal.type === "group-manager") content = state.groupLoading ? `<div class="account-empty" role="status"><span class="loading-spinner"></span><strong>Cargando administración del grupo…</strong></div>` : renderGroupManager(state);
  else if (modal.type === "edit-message") content = renderEditMessage(modal);
  else if (modal.type === "delete-message") content = renderDeleteMessage(modal);
  else if (modal.type === "settings") content = renderSettings(state);
  else if (modal.type === "notifications") content = renderNotifications(state);
  else if (modal.type === "search-results") content = renderSearchResults(modal);
  else if (modal.type === "file-preview") content = renderFilePreview(modal);

  return `
    <div class="modal-backdrop" data-action="modal-backdrop">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
        <header class="modal-header"><div><span class="eyebrow">NEXO</span><h2 id="modal-title">${title}</h2></div><button class="icon-button" type="button" aria-label="Cerrar ventana" data-action="close-modal">${icon("close")}</button></header>
        <div class="modal-content"><div class="modal-body">${content}</div><p class="form-error" id="modal-error" role="alert" aria-live="assertive" hidden></p></div>
      </section>
    </div>`;
}
