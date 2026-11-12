import { escapeHtml, icon } from "../utils/dom.js";
import { formatTime, truncate } from "../utils/format.js";
import { renderAvatar } from "./components/Avatar.js";
import { getModalInstanceKey, getModalRenderSignature, renderModal } from "./components/Modal.js";

function renderConversationItem(conversation, activeId) {
  const active = conversation.id === activeId;
  const label = conversation.kind === "group" ? "Grupo" : "Privada";
  return `<button class="conversation-item ${active ? "is-active" : ""}" type="button" data-action="open-conversation" data-id="${escapeHtml(conversation.id)}" aria-current="${active ? "page" : "false"}">
    ${renderAvatar(conversation.title, conversation.avatarPath, "medium")}
    <span class="conversation-item__body"><span class="conversation-item__top"><strong>${escapeHtml(conversation.title)}</strong><time>${escapeHtml(formatTime(conversation.lastMessageAt))}</time></span><span class="conversation-item__bottom"><span>${escapeHtml(truncate(conversation.lastMessage || label, 58))}</span>${conversation.unreadCount ? `<span class="unread-count">${conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>` : ""}</span></span>
  </button>`;
}

function renderSidebar(state) {
  const items = state.loading
    ? `<div class="list-skeleton" role="status" aria-live="polite" aria-label="Cargando conversaciones"><i></i><i></i><i></i><i></i></div>`
    : state.conversations.length
      ? state.conversations.map((conversation) => renderConversationItem(conversation, state.activeConversation?.id)).join("")
      : `<div class="sidebar-empty"><span class="empty-icon">${icon("message", 22)}</span><strong>${state.user ? "Todavía no hay chats" : "Tu espacio te espera"}</strong><p>${state.user ? "Cuando inicies una conversación, aparecerá aquí." : "Inicia sesión para cargar tus conversaciones y contactos."}</p>${state.user ? `<button class="text-button" data-action="new-chat" type="button">Buscar personas</button>` : `<button class="text-button" data-action="open-auth" type="button">Iniciar sesión</button>`}</div>`;

  return `<aside class="sidebar" aria-label="Panel de conversaciones">
    <div class="sidebar__top">
      <a class="brand" href="#/app" aria-label="Nexo, inicio"><span class="brand-mark">n</span><span>nexo<span class="brand-dot">.</span></span></a>
      <span class="brand-caption">MENSAJERÍA PRIVADA</span>
      <button class="icon-button" type="button" aria-label="Contactos" title="Contactos" data-action="open-contacts">${icon("users")}</button>
      ${state.user ? `<button class="icon-button notification-button" type="button" aria-label="Notificaciones" title="Notificaciones" data-action="open-notifications">${icon("bell")}${state.settings?.in_app_notifications !== false && state.unreadNotificationCount ? `<span class="notification-badge">${state.unreadNotificationCount > 99 ? "99+" : state.unreadNotificationCount}</span>` : ""}</button>` : ""}
      <button class="icon-button sidebar-settings" type="button" aria-label="Configuración" data-action="open-settings">${icon("settings")}</button>
    </div>
    <div class="sidebar-welcome"><div><span class="eyebrow">TU ESPACIO</span><h1>Mensajes</h1></div><div class="sidebar-welcome__actions"><button class="icon-button" type="button" data-action="${state.user ? "new-group" : "open-auth"}" aria-label="Crear grupo" title="Crear grupo">${icon("users", 18)}</button><button class="new-chat-button" type="button" data-action="${state.user ? "new-chat" : "open-auth"}" aria-label="${state.user ? "Nueva conversación" : "Iniciar sesión"}" title="${state.user ? "Nueva conversación" : "Iniciar sesión"}">${icon("plus", 21)}</button></div></div>
    <form class="conversation-search" data-form="conversation-search"><span>${icon("search", 18)}</span><label class="sr-only" for="conversation-search-input">Buscar conversaciones</label><input id="conversation-search-input" name="query" type="search" placeholder="Buscar conversaciones" autocomplete="off"><kbd>⌘ K</kbd></form>
    <div class="conversation-tabs"><span class="conversation-tabs__active">Todos <span>${state.conversations.length}</span></span><button type="button" class="text-button" data-action="refresh-conversations">Actualizar ${icon("refresh", 14)}</button></div>
    <div class="conversation-list" id="conversation-list">${items}</div>
    <div class="sidebar-footer">
      ${state.user ? `<button type="button" class="profile-chip" data-action="profile-menu">${renderAvatar(state.user.displayName, state.user.avatarUrl || state.user.avatarPath, "small")}<span><strong>${escapeHtml(state.user.displayName)}</strong><small>@${escapeHtml(state.user.username || "usuario")}</small></span>${icon("more", 18)}</button><div class="profile-menu" id="profile-menu" hidden><button type="button" data-action="open-profile">${icon("user", 17)} Mi perfil</button><button type="button" data-action="open-contacts">${icon("users", 17)} Contactos y solicitudes</button><button type="button" data-action="open-settings">${icon("settings", 17)} Configuración</button><button type="button" data-action="logout">${icon("back", 17)} Cerrar sesión</button></div>` : `<button class="profile-signin" type="button" data-action="open-auth">${icon("user", 18)} <span>Iniciar sesión</span></button>`}
      <div class="connection-note connection-note--${escapeHtml(state.networkStatus || "connecting")}" role="status" aria-live="polite"><span class="connection-dot"></span><span>${escapeHtml(connectionLabel(state.networkStatus, Boolean(state.user)))}</span><span class="connection-lock">${icon("lock", 13)}</span></div>
    </div>
  </aside>`;
}

function renderWelcome(state) {
  return `<section class="welcome-state" aria-labelledby="welcome-title"><div class="welcome-art" aria-hidden="true"><div class="welcome-orbit welcome-orbit--one"></div><div class="welcome-orbit welcome-orbit--two"></div><div class="welcome-bubble welcome-bubble--main">${icon("message", 42)}</div><span class="welcome-spark welcome-spark--one"></span><span class="welcome-spark welcome-spark--two"></span><span class="welcome-spark welcome-spark--three"></span></div><span class="eyebrow">UN LUGAR PARA CONECTAR</span><h2 id="welcome-title">Las buenas conversaciones<br><em>empiezan aquí.</em></h2><p>${state.user ? "Elige una conversación de tu lista o busca a alguien para empezar una nueva." : "Un espacio sencillo y privado para mantenerte cerca de las personas importantes."}</p><div class="welcome-actions">${state.user ? `<button class="button button--primary" type="button" data-action="new-chat">${icon("plus", 18)} Nueva conversación</button>` : `<button class="button button--primary" type="button" data-action="open-auth">Iniciar sesión ${icon("back", 17)}</button>`}</div><div class="welcome-footnote">${icon("shield", 15)} Tus conversaciones pertenecen a tu cuenta, no a este dispositivo.</div></section>`;
}

function formatMessageDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function formatPresenceTime(value) {
  if (!value) return "Desconectado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Desconectado";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (sameDay) return `Última vez hoy a las ${time}`;
  const days = Math.floor((now.setHours(0,0,0,0) - new Date(date).setHours(0,0,0,0)) / 86_400_000);
  if (days === 1) return `Última vez ayer a las ${time}`;
  return `Última vez ${new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(date)} a las ${time}`;
}

function messageReceiptLabel(message, userId, conversation) {
  if (message.senderId !== userId || message.deletedAt) return "";
  const receipts = (message.receipts || []).filter((receipt) => receipt.user_id !== userId);
  if (!receipts.length) return "Enviado";
  const delivered = receipts.filter((receipt) => receipt.delivered_at).length;
  const read = receipts.filter((receipt) => receipt.read_at).length;
  const total = receipts.length;
  if (conversation.kind === "private") {
    if (read === total) return "Leído";
    if (delivered === total) return "Entregado";
    return "Enviado";
  }
  if (read > 0) return `Visto ${read}/${total}`;
  if (delivered > 0) return `Entregado ${delivered}/${total}`;
  return "Enviado";
}

function connectionLabel(status, signedIn = true) {
  if (!signedIn) return "Sin sesión";
  if (status === "online") return "Conectado";
  if (status === "offline") return "Sin conexión";
  if (status === "reconnecting") return "Reconectando";
  return "Conectando…";
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function renderMessage(message, userId, conversation, messageMap) {
  const own = message.senderId === userId;
  const sender = message.sender || {};
  const isGroup = conversation.kind === "group";
  const reply = message.replyTo ? messageMap.get(message.replyTo) : null;
  const deleted = Boolean(message.deletedAt);
  const mayEdit = own && !deleted && Date.now() - new Date(message.createdAt).getTime() <= 15 * 60_000;
  const reactionCounts = new Map();
  for (const reaction of message.reactions || []) {
    reactionCounts.set(reaction.emoji, (reactionCounts.get(reaction.emoji) || 0) + 1);
  }
  const reactions = [...reactionCounts.entries()].map(([emoji, count]) => {
    const reactedByMe = (message.reactions || []).some((reaction) => reaction.user_id === userId && reaction.emoji === emoji);
    return `<button class="message-reaction ${reactedByMe ? "is-selected" : ""}" type="button" data-action="react-message" data-id="${escapeHtml(message.id)}" data-emoji="${escapeHtml(emoji)}" data-remove="${reactedByMe}" aria-pressed="${reactedByMe}" aria-label="${reactedByMe ? "Quitar" : "Añadir"} reacción ${escapeHtml(emoji)}; ${count} reacciones">${escapeHtml(emoji)} <span>${count}</span></button>`;
  }).join("");
  const body = deleted
    ? `<p class="message-deleted">${icon("ban", 14)} Este mensaje fue eliminado.</p>`
    : `${reply ? `<div class="message-reply"><strong>${escapeHtml(reply.sender?.displayName || "Respuesta")}</strong><span>${escapeHtml(reply.deletedAt ? "Mensaje eliminado" : truncate(reply.body, 110))}</span></div>` : ""}${message.body ? `<p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>` : ""}${(message.attachments || []).length ? `<div class="message-attachment-note">${(message.attachments || []).map((attachment) => `<button type="button" class="message-attachment-card ${String(attachment.mime_type || "").startsWith("image/") ? "is-image" : ""}" data-action="open-attachment" data-id="${escapeHtml(attachment.id)}" data-mime="${escapeHtml(attachment.mime_type || "")}" aria-label="${String(attachment.mime_type || "").startsWith("image/") ? "Ver imagen" : "Descargar archivo"} ${escapeHtml(attachment.file_name || "adjunto")}">${icon(String(attachment.mime_type || "").startsWith("image/") ? "image" : "paperclip", 15)}<span><strong>${escapeHtml(attachment.file_name || "Archivo adjunto")}</strong><small>${escapeHtml(formatFileSize(attachment.byte_size))} · ${String(attachment.mime_type || "").startsWith("image/") ? "Vista previa" : "Descargar"}</small></span></button>`).join("")}</div>` : ""}`;
  const quickReactions = deleted ? "" : ["👍", "❤️", "😂", "🙏"].map((emoji) => {
    const reactedByMe = (message.reactions || []).some((reaction) => reaction.user_id === userId && reaction.emoji === emoji);
    return `<button class="message-quick-reaction ${reactedByMe ? "is-selected" : ""}" type="button" data-action="react-message" data-id="${escapeHtml(message.id)}" data-emoji="${emoji}" data-remove="${reactedByMe}" aria-pressed="${reactedByMe}" aria-label="${reactedByMe ? "Quitar" : "Añadir"} reacción ${emoji}">${emoji}</button>`;
  }).join("");
  const actions = deleted ? "" : `<div class="message-actions" aria-label="Acciones del mensaje"><button type="button" data-action="reply-message" data-id="${escapeHtml(message.id)}">Responder</button>${mayEdit ? `<button type="button" data-action="edit-message" data-id="${escapeHtml(message.id)}">Editar</button><button type="button" class="danger-text" data-action="delete-message" data-id="${escapeHtml(message.id)}">Eliminar</button>` : ""}<span class="message-quick-reactions">${quickReactions}</span></div>`;
  const timestamp = formatMessageDateTime(message.createdAt);
  return `<article class="message-row ${own ? "message-row--own" : ""}" data-message-id="${escapeHtml(message.id)}">
    <div class="message-stack">
      ${isGroup && !own ? `<span class="message-sender">${escapeHtml(sender.displayName || sender.username || "Usuario")}</span>` : ""}
      <div class="message-bubble ${deleted ? "message-bubble--deleted" : ""}">${body}<time datetime="${escapeHtml(message.createdAt || "")}" title="${escapeHtml(new Date(message.createdAt).toLocaleString("es-CO"))}">${escapeHtml(timestamp)}${message.editedAt && !deleted ? " · editado" : ""}</time></div>
      ${own && !deleted ? `<span class="message-delivery-status" title="Estado de este mensaje">${messageReceiptLabel(message, userId, conversation)}</span>` : ""}
      ${reactions ? `<div class="message-reactions">${reactions}</div>` : ""}
      ${actions}
    </div>
  </article>`;
}

function renderChat(state) {
  const conversation = state.activeConversation;
  if (!conversation) return `<main class="chat-panel chat-panel--empty">${renderWelcome(state)}</main>`;
  const messageMap = new Map(state.messages.map((message) => [message.id, message]));
  const messages = state.messagesLoading
    ? `<div class="chat-loading"><span class="loading-spinner"></span><span>Cargando mensajes…</span></div>`
    : state.messages.length
      ? `${state.messagesHasMore ? `<div class="history-pagination"><button class="button button--outline button--small" type="button" data-action="load-earlier-messages" ${state.messagesLoadingEarlier ? "disabled" : ""}>${state.messagesLoadingEarlier ? `<span class="loading-spinner loading-spinner--small"></span> Cargando…` : "Cargar mensajes anteriores"}</button></div>` : ""}${state.messages.map((message) => renderMessage(message, state.user?.id, conversation, messageMap)).join("")}`
      : `<div class="chat-empty-history"><span class="empty-icon">${icon("message", 24)}</span><strong>Esta conversación está lista</strong><p>Cuando envíes el primer mensaje, aparecerá aquí.</p></div>`;
  const replyBanner = state.replyingTo ? `<div class="composer-reply"><div><strong>Respondiendo a ${escapeHtml(state.replyingTo.sender?.displayName || "un mensaje")}</strong><span>${escapeHtml(truncate(state.replyingTo.body || "Mensaje", 100))}</span></div><button type="button" class="icon-button" data-action="cancel-reply" aria-label="Cancelar respuesta">${icon("close", 16)}</button></div>` : "";
  const pendingAttachments = state.pendingAttachments || [];
  const pendingBar = pendingAttachments.length ? `<div class="composer-pending-files">${pendingAttachments.map((attachment) => `<div class="pending-file-chip">${attachment.previewObjectUrl ? `<img src="${escapeHtml(attachment.previewObjectUrl)}" alt="Vista previa de ${escapeHtml(attachment.fileName || attachment.file_name)}">` : icon("paperclip", 14)}<span>${escapeHtml(attachment.fileName || attachment.file_name || "Archivo")}</span><button type="button" data-action="remove-pending-attachment" data-id="${escapeHtml(attachment.id)}" aria-label="Quitar ${escapeHtml(attachment.fileName || attachment.file_name || "archivo")}">${icon("close", 13)}</button></div>`).join("")}</div>` : "";
  const others = conversation.kind === "private"
    ? (conversation.members || []).filter((member) => member.id !== state.user?.id)
    : [];
  const peerPresence = others.length ? (state.presence || []).find((item) => item.userId === others[0].id) : null;
  const onlineCount = (state.presence || []).filter((item) => item.online).length;
  const typingUsers = (state.presence || []).filter((item) => item.typing);
  const groupSubtitle = conversation.kind === "group"
    ? `${(conversation.members || []).length} participantes${onlineCount ? ` · ${onlineCount} en línea` : ""}`
    : (peerPresence?.online ? "En línea" : formatPresenceTime(peerPresence?.lastSeen));
  const typingText = typingUsers.length === 1
    ? `${typingUsers[0].username || "Alguien"} está escribiendo…`
    : typingUsers.length === 2
      ? `${typingUsers[0].username || "Alguien"} y ${typingUsers[1].username || "alguien"} están escribiendo…`
      : typingUsers.length > 2 ? `${typingUsers.length} personas están escribiendo…` : "";
  return `<main class="chat-panel chat-panel--active">
    <header class="chat-header"><button class="icon-button mobile-back" type="button" aria-label="Volver a conversaciones" data-action="back-to-list">${icon("back")}</button>${renderAvatar(conversation.title, conversation.avatarUrl || conversation.avatarPath, "medium")}<div class="chat-header__identity"><strong>${escapeHtml(conversation.title)}</strong><span class="chat-presence ${peerPresence?.online ? "is-online" : ""}">${escapeHtml(groupSubtitle)}</span></div><span class="chat-header__spacer"></span><button class="icon-button" type="button" data-action="toggle-details" aria-label="Información de la conversación">${icon("info")}</button><button class="icon-button" type="button" data-action="chat-menu" aria-label="Más opciones">${icon("more")}</button></header>
    ${typingText ? `<div class="typing-indicator" role="status" aria-live="polite"><span class="typing-indicator__dots"><i></i><i></i><i></i></span>${escapeHtml(typingText)}</div>` : ""}
    <div class="message-history" id="message-history" role="log" aria-label="Historial de mensajes" aria-live="polite" aria-relevant="additions text">${messages}</div>
    ${replyBanner}
    ${pendingBar}
    <form class="composer" data-form="send-message"><button class="icon-button composer-attach" type="button" data-action="choose-attachment" aria-label="Adjuntar archivo" title="Adjuntar archivo" ${state.user ? "" : "disabled"}>${icon("paperclip", 18)}</button><input id="chat-attachment-input" type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip"><div class="composer__input-wrap"><label class="sr-only" for="message-input">Escribe un mensaje</label><textarea id="message-input" name="body" rows="1" maxlength="4000" placeholder="Escribe un mensaje…" ${state.user ? "" : "disabled"}></textarea><span class="composer__hint">Enter para enviar · Shift + Enter para nueva línea · Archivos hasta 10 MB</span></div><button class="send-button" type="submit" aria-label="Enviar mensaje" ${state.user ? "" : "disabled"}>${icon("send", 19)}</button></form>
  </main>`;
}

function renderDetails(state) {
  const conversation = state.activeConversation;
  if (!conversation) return `<aside class="details-panel" aria-label="Información" aria-hidden="${state.detailsOpen ? "false" : "true"}"><div class="details-header"><span class="eyebrow">DETALLES</span><button class="icon-button details-close" data-action="close-details" type="button" aria-label="Cerrar información">${icon("close")}</button></div><div class="details-empty">${icon("info", 27)}<strong>Información del chat</strong><p>Selecciona una conversación para consultar sus participantes y detalles.</p></div><div class="privacy-card">${icon("shield", 19)}<div><strong>Privacidad primero</strong><p>El acceso a tus conversaciones se verifica en el servidor.</p></div></div></aside>`;
  const members = conversation.members || [];
  const isGroup = conversation.kind === "group";
  const canManage = isGroup && ["owner", "admin"].includes(conversation.myRole);
  return `<aside class="details-panel" aria-label="Información de la conversación" aria-hidden="${state.detailsOpen ? "false" : "true"}"><div class="details-header"><span class="eyebrow">DETALLES</span><button class="icon-button details-close" data-action="close-details" type="button" aria-label="Cerrar información">${icon("close")}</button></div><div class="details-profile">${renderAvatar(conversation.title, conversation.avatarUrl || conversation.avatarPath, "large")}<strong>${escapeHtml(conversation.title)}</strong><span>${isGroup ? "Conversación grupal" : "Conversación privada"}</span>${isGroup && conversation.description ? `<p class="details-description">${escapeHtml(conversation.description)}</p>` : ""}</div><div class="details-section"><h3>Participantes <span>${members.length}</span></h3>${members.map((member) => `<div class="member-row">${renderAvatar(member.displayName || member.username, member.avatarUrl || member.avatarPath, "small")}<span><strong>${escapeHtml(member.displayName || member.username)}</strong><small>@${escapeHtml(member.username || "usuario")}${member.role === "owner" ? " · Propietario" : member.role === "admin" ? " · Administrador" : ""}</small></span></div>`).join("") || `<p class="subtle-copy">No hay información adicional disponible.</p>`}</div>${isGroup ? `<div class="group-detail-actions">${canManage ? `<button class="button button--outline button--full" type="button" data-action="manage-group">${icon("settings", 16)} Administrar grupo</button>` : ""}<button class="text-button danger-text" type="button" data-action="group-leave">${conversation.myRole === "owner" ? "Salir y transferir propiedad" : "Salir del grupo"}</button></div>` : ""}<div class="privacy-card">${icon("shield", 19)}<div><strong>Conversación privada</strong><p>Solo los miembros autorizados pueden acceder a este espacio.</p></div></div></aside>`;
}

export class AppView {
  constructor(root) { this.root = root; }

  render(state) {
    const previousComposer = this.root.querySelector?.("#message-input") || null;
    const composerState = previousComposer ? {
      value: previousComposer.value,
      focused: document.activeElement === previousComposer,
      start: previousComposer.selectionStart,
      end: previousComposer.selectionEnd,
    } : null;
    const previousHistory = this.root.querySelector?.("#message-history") || null;
    const previous = previousHistory ? {
      scrollTop: previousHistory.scrollTop,
      scrollHeight: previousHistory.scrollHeight,
      clientHeight: previousHistory.clientHeight,
      nearBottom: previousHistory.scrollHeight - previousHistory.scrollTop - previousHistory.clientHeight < 120,
    } : null;

    const shellMarkup = `<div class="app-shell ${state.activeConversation ? "has-active-chat" : ""} ${state.detailsOpen ? "details-open" : ""} ${state.modal ? "has-modal" : ""}" data-theme="${state.theme}">
      ${renderSidebar(state)}
      ${renderChat(state)}
      ${state.detailsOpen && state.activeConversation ? `<button class="details-scrim" type="button" data-action="close-details" aria-label="Cerrar detalles de la conversación"></button>` : ""}
      ${renderDetails(state)}
      ${state.error ? `<div class="global-error" role="alert">${icon("alert", 17)}<span>${escapeHtml(state.error)}</span><button type="button" data-action="dismiss-error" aria-label="Cerrar">${icon("close", 16)}</button></div>` : ""}
      ${renderModal(state.modal, state.theme, state)}
    </div>`;

    // The fallback keeps lightweight, non-browser unit-test DOM shims working.
    // Actual browsers always use the node-preserving rendering path below.
    if (typeof document.createElement !== "function") {
      this.root.innerHTML = shellMarkup;
      document.documentElement.dataset.theme = state.theme;
      document.body.classList.toggle("modal-open", Boolean(state.modal));
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = shellMarkup;
    const nextShell = template.content.firstElementChild;
    const currentShell = this.root.querySelector?.(":scope > .app-shell") || null;

    if (!currentShell) {
      const initialModal = nextShell.querySelector(":scope > .modal-backdrop");
      if (initialModal) {
        initialModal.__nexoModalKey = getModalInstanceKey(state.modal);
        initialModal.__nexoModalSignature = getModalRenderSignature(state.modal, state);
      }
      this.root.replaceChildren(nextShell);
    } else {
      const currentModal = currentShell.querySelector(":scope > .modal-backdrop");
      const nextModal = nextShell.querySelector(":scope > .modal-backdrop");
      const nextModalKey = getModalInstanceKey(state.modal);
      const canReuseModal = Boolean(currentModal && nextModal && currentModal.__nexoModalKey === nextModalKey);

      // Keep the app shell and, crucially, the current modal node connected to the
      // document. Replacing only the shell's other children prevents its entrance
      // animation, scroll position and form state from restarting during polling.
      for (const child of [...currentShell.children]) {
        if (canReuseModal && child === currentModal) continue;
        child.remove();
      }
      for (const child of [...nextShell.children]) {
        if (child === nextModal) continue;
        currentShell.insertBefore(child, canReuseModal ? currentModal : null);
      }
      currentShell.className = nextShell.className;
      currentShell.dataset.theme = nextShell.dataset.theme;

      if (canReuseModal) {
        this.updateModalNode(currentModal, nextModal, getModalRenderSignature(state.modal, state));
      } else if (nextModal) {
        nextModal.__nexoModalKey = nextModalKey;
        nextModal.__nexoModalSignature = getModalRenderSignature(state.modal, state);
        currentShell.append(nextModal);
      }
    }

    document.documentElement.dataset.theme = state.theme;
    document.body.classList.toggle("modal-open", Boolean(state.modal));

    const composer = this.root.querySelector?.("#message-input") || null;
    if (composer && composerState && state.activeConversation) {
      composer.value = composerState.value;
      if (composerState.focused) {
        composer.focus({ preventScroll: true });
        try { composer.setSelectionRange(composerState.start, composerState.end); } catch { /* Some input types do not expose selection. */ }
      }
    }

    const history = this.root.querySelector?.("#message-history") || null;
    if (history) {
      const restore = state.historyRestore;
      if (restore?.mode === "bottom" || (restore?.mode === "near-bottom" && previous?.nearBottom)) {
        history.scrollTop = history.scrollHeight;
      } else if (restore?.mode === "height-delta" && previous) {
        history.scrollTop = Math.max(0, previous.scrollTop + history.scrollHeight - previous.scrollHeight);
      } else if (previous) {
        history.scrollTop = Math.min(previous.scrollTop, Math.max(0, history.scrollHeight - history.clientHeight));
      }
    }
    if (state.historyRestore) state.historyRestore = null;
  }

  updateModalNode(currentModal, nextModal, nextSignature) {
    const currentTitle = currentModal.querySelector("#modal-title");
    const nextTitle = nextModal.querySelector("#modal-title");
    if (currentTitle && nextTitle && currentTitle.textContent !== nextTitle.textContent) {
      currentTitle.textContent = nextTitle.textContent;
    }

    if (currentModal.__nexoModalSignature === nextSignature) return;

    const currentBody = currentModal.querySelector(".modal-body");
    const nextBody = nextModal.querySelector(".modal-body");
    if (currentBody && nextBody) {
      const scrollTop = currentModal.querySelector(".modal-card")?.scrollTop || 0;
      const active = document.activeElement;
      const focusedControl = currentBody.contains(active) ? {
        id: active.id || "",
        name: active.getAttribute("name") || "",
        tagName: active.tagName,
      } : null;

      currentBody.innerHTML = nextBody.innerHTML;
      const card = currentModal.querySelector(".modal-card");
      if (card) card.scrollTop = scrollTop;

      if (focusedControl) {
        const replacement = [...currentBody.querySelectorAll("input, textarea, select, button, [tabindex]")]
          .find((element) => (focusedControl.id && element.id === focusedControl.id)
            || (focusedControl.name && element.tagName === focusedControl.tagName && element.getAttribute("name") === focusedControl.name));
        replacement?.focus({ preventScroll: true });
      }
    }

    const error = currentModal.querySelector("#modal-error");
    if (error) { error.textContent = ""; error.hidden = true; }
    currentModal.__nexoModalSignature = nextSignature;
  }

  filterConversations(query) {
    const normalized = query.trim().toLocaleLowerCase("es");
    this.root.querySelectorAll(".conversation-item").forEach((item) => {
      item.hidden = !item.textContent.toLocaleLowerCase("es").includes(normalized);
    });
  }

  toggleProfileMenu() {
    const menu = this.root.querySelector("#profile-menu");
    if (menu) menu.hidden = !menu.hidden;
  }

  trapModalFocus(event) {
    const dialog = this.root.querySelector("[role=dialog]");
    const focusable = [...(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  focusConversationSearch() {
    this.root.querySelector("#conversation-search-input")?.focus();
  }

  focusModal() {
    const card = this.root.querySelector(".modal-card");
    const target = card?.querySelector('input:not([type="hidden"]), textarea, select, button:not([aria-label="Cerrar ventana"])')
      || card?.querySelector("button")
      || card;
    target?.focus({ preventScroll: true });
  }

  resetForm(form) { form?.reset(); }

  captureHistory() {
    const history = this.root.querySelector("#message-history");
    if (!history) return null;
    return {
      mode: "height-delta",
      scrollTop: history.scrollTop,
      scrollHeight: history.scrollHeight,
      nearBottom: history.scrollHeight - history.scrollTop - history.clientHeight < 120,
    };
  }

  showGroupAvatarPreview(file) {
    const avatar = this.root.querySelector(".group-avatar-preview .avatar");
    if (!avatar || !file) return;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(file);
    avatar.innerHTML = `<img src="${this.previewUrl}" alt="Vista previa de la fotografía del grupo" loading="eager">`;
  }

  scrollToMessage(messageId) {
    const target = [...(this.root.querySelectorAll?.("[data-message-id]") || [])].find((element) => element.dataset.messageId === messageId);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("message-row--search-hit");
    if (target) window.setTimeout(() => target.classList.remove("message-row--search-hit"), 2200);
  }

  scrollMessageHistoryToBottom() {
    const history = this.root.querySelector("#message-history");
    if (history) history.scrollTop = history.scrollHeight;
  }

  setSubmitBusy(form, busy, label = "Procesando…") {
    const button = form?.querySelector('button[type="submit"]');
    if (!button) return;
    if (busy) { button.dataset.originalText = button.textContent; button.disabled = true; button.textContent = label; }
    else { button.disabled = false; if (button.dataset.originalText) button.textContent = button.dataset.originalText; }
  }

  renderContactResults(results, message = "") {
    const target = this.root.querySelector("#contact-search-results");
    if (!target) return;
    if (message) { target.innerHTML = `<div class="results-hint">${escapeHtml(message)}</div>`; return; }
    if (!results.length) { target.innerHTML = `<div class="results-hint">No encontramos cuentas con esos datos.</div>`; return; }
    target.innerHTML = results.map((user) => `<div class="contact-result">${renderAvatar(user.displayName || user.username, user.avatarUrl || user.avatarPath, "medium")}<span><strong>${escapeHtml(user.displayName || user.username)}</strong><small>@${escapeHtml(user.username)}</small></span><button type="button" class="button button--outline button--small" data-action="add-contact" data-id="${escapeHtml(user.id)}">Agregar</button></div>`).join("");
  }

  showAvatarPreview(file) {
    const avatar = this.root.querySelector(".profile-editor-avatar .avatar");
    if (!avatar || !file) return;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(file);
    avatar.innerHTML = `<img src="${this.previewUrl}" alt="Vista previa de la fotografía" loading="eager">`;
  }

  showModalError(message) {
    const target = this.root.querySelector("#modal-error");
    if (target) { target.textContent = message; target.hidden = false; }
  }

  closeModal() {
    const modal = this.root.querySelector(".modal-backdrop");
    if (modal) modal.remove();
    document.body.classList.remove("modal-open");
  }

  toast(message, type = "success") {
    const region = document.querySelector("#toast-region");
    if (!region) return;
    const allowedTypes = new Set(["success", "error", "info", "warning"]);
    const safeType = allowedTypes.has(type) ? type : "success";
    const item = document.createElement("div");
    item.className = `toast toast--${safeType}${String(message ?? "").trim() === "Has cerrado tu sesión." ? " toast--logout" : ""}`;
    item.setAttribute("role", safeType === "error" ? "alert" : "status");
    item.setAttribute("aria-live", safeType === "error" ? "assertive" : "polite");
    item.setAttribute("aria-atomic", "true");
    item.textContent = String(message ?? "");
    region.append(item);
    setTimeout(() => item.remove(), 3600);
  }
}
