import { APP_CONFIG } from "../config/appConfig.js";

export class MessageController {
  constructor(model, view) { this.model = model; this.view = view; this.reactionLocks = new Set(); }

  reply(messageId) {
    const message = this.model.state.messages.find((item) => item.id === messageId);
    if (!message || message.deletedAt) return;
    this.model.update({ replyingTo: message });
    this.view.root.querySelector("#message-input")?.focus();
  }

  cancelReply() { this.model.update({ replyingTo: null }); }

  async send(form) {
    const body = String(new FormData(form).get("body") || "").trim();
    const conversation = this.model.state.activeConversation;
    const pendingAttachments = this.model.state.pendingAttachments || [];
    if (!conversation || (!body && !pendingAttachments.length) || body.length > APP_CONFIG.maxMessageLength) return;
    const replyTo = this.model.state.replyingTo?.id || null;
    const attachmentIds = pendingAttachments.map((attachment) => attachment.id);
    this.view.setSubmitBusy(form, true, "Enviando…");
    try {
      await this.model.messages.send(conversation.id, body, crypto.randomUUID(), replyTo, attachmentIds);
      for (const attachment of pendingAttachments) {
        if (attachment.previewObjectUrl) URL.revokeObjectURL(attachment.previewObjectUrl);
      }
      this.view.resetForm(form);
      this.model.update({ replyingTo: null, pendingAttachments: [] });
      await this.model.reloadMessages({ mode: "bottom" });
      await this.model.messages.markRead(conversation.id).catch(() => {});
      await this.model.loadConversations();
      this.view.scrollMessageHistoryToBottom();
    } catch (error) { this.view.toast(error.message, "error"); }
    finally { this.view.setSubmitBusy(form, false); }
  }

  async loadEarlier() {
    const history = this.view.captureHistory();
    await this.model.loadEarlierMessages(history);
  }

  async sync() {
    const history = this.view.captureHistory();
    await this.model.syncNewMessages(history?.nearBottom === true);
  }

  openEdit(messageId) {
    const message = this.model.state.messages.find((item) => item.id === messageId);
    if (!message || message.senderId !== this.model.state.user?.id || message.deletedAt) return;
    this.model.update({ modal: { type: "edit-message", title: "Editar mensaje", messageId, body: message.body } });
    this.view.focusModal();
  }

  async edit(form) {
    const data = new FormData(form);
    const messageId = String(data.get("messageId") || "");
    const body = String(data.get("body") || "").trim();
    if (!body || body.length > APP_CONFIG.maxMessageLength) return this.view.showModalError("Escribe un mensaje de hasta 4000 caracteres.");
    this.view.setSubmitBusy(form, true, "Guardando…");
    try {
      await this.model.messages.edit(messageId, body);
      this.model.update({ modal: null });
      await this.model.reloadMessages({ mode: "position" });
      this.view.toast("Mensaje actualizado.");
    } catch (error) { this.view.showModalError(error.message); }
    finally { this.view.setSubmitBusy(form, false); }
  }

  confirmDelete(messageId) {
    const message = this.model.state.messages.find((item) => item.id === messageId);
    if (!message || message.senderId !== this.model.state.user?.id || message.deletedAt) return;
    this.model.update({ modal: { type: "delete-message", title: "Eliminar mensaje", messageId } });
    this.view.focusModal();
  }

  async deleteConfirmed() {
    const messageId = this.model.state.modal?.messageId;
    if (!messageId) return;
    try {
      await this.model.messages.delete(messageId);
      this.model.update({ modal: null });
      await this.model.reloadMessages({ mode: "position" });
      await this.model.loadConversations();
      this.view.toast("Mensaje eliminado para todos.");
    } catch (error) { this.view.showModalError(error.message); }
  }

  async react(messageId, emoji, remove = false) {
    const key = `${messageId}:${emoji}`;
    if (this.reactionLocks.has(key)) return;
    const message = this.model.state.messages.find((item) => item.id === messageId);
    const userId = this.model.state.user?.id;
    if (!message || !userId) return;

    this.reactionLocks.add(key);
    const previous = [...(message.reactions || [])];
    const alreadySelected = previous.some((item) => item.user_id === userId && item.emoji === emoji);
    const shouldRemove = remove || alreadySelected;
    message.reactions = shouldRemove
      ? previous.filter((item) => !(item.user_id === userId && item.emoji === emoji))
      : [...previous, { user_id: userId, emoji }];
    this.model.update({ messages: [...this.model.state.messages] });

    try {
      await this.model.messages.react(messageId, emoji, shouldRemove);
    } catch (error) {
      message.reactions = previous;
      this.model.update({ messages: [...this.model.state.messages] });
      this.view.toast(error.message, "error");
    } finally {
      this.reactionLocks.delete(key);
    }
  }
}
