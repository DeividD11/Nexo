import { MessagingRepository } from "./repository.ts";

const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export class MessagingService {
  constructor(database: any, dependencies: any) {
    this.repository = new MessagingRepository(database);
    this.deps = dependencies;
  }

  private repository: MessagingRepository;
  private deps: any;

  private error(message: string, status = 400, code = "BAD_REQUEST"): never {
    throw new this.deps.ApiError(message, status, code);
  }

  private requireConversationId(value: unknown): string {
    const id = this.deps.str(value, 40);
    if (!this.deps.isUuid(id)) this.error("Conversación no válida.");
    return id;
  }

  private parseCursor(value: unknown): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) {
      this.error("El cursor de mensajes no es válido.");
    }
    return new Date(value).toISOString();
  }

  async list(user: any, input: any) {
    const conversationId = this.requireConversationId(input.conversationId);
    await this.deps.requireMember(conversationId, user.id);

    const requestedLimit = Number(input.limit);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, MAX_PAGE_SIZE))
      : DEFAULT_PAGE_SIZE;
    const before = this.parseCursor(input.before);
    const after = this.parseCursor(input.after);
    if (before && after) this.error("Solo puedes utilizar un cursor de paginación a la vez.");

    const afterId = input.afterId ? this.deps.str(input.afterId, 40) : null;
    const beforeId = input.beforeId ? this.deps.str(input.beforeId, 40) : null;
    if (afterId && !this.deps.isUuid(afterId)) this.error("El cursor de mensaje no es válido.");
    if (beforeId && !this.deps.isUuid(beforeId)) this.error("El cursor de mensaje no es válido.");
    if (beforeId && !before) this.error("El cursor beforeId necesita una fecha anterior.");
    if (afterId && !after) this.error("El cursor afterId necesita una fecha posterior.");

    const { data, error } = await this.repository.listMessages(conversationId, limit, before, after, afterId, beforeId);
    if (error) {
      console.error("message_list_failed", error.code || "unknown");
      this.error("No se pudieron cargar los mensajes.", 503, "MESSAGE_LIST_FAILED");
    }

    const rows = data || [];
    if (!after) rows.reverse();
    const ids = rows.map((message: any) => message.id);
    const senderIds = [...new Set(rows.map((message: any) => message.sender_id))];

    const [deliveryResult, enrichment] = await Promise.all([
      this.repository.markDelivered(user.id, ids),
      this.repository.loadEnrichment(ids),
    ]);
    if (deliveryResult.error || enrichment.error) {
      console.error("message_enrichment_failed", (deliveryResult.error || enrichment.error).code || "unknown");
      this.error("No se pudieron cargar todos los datos de los mensajes.", 503, "MESSAGE_ENRICHMENT_FAILED");
    }

    const senders = await Promise.all(senderIds.map((id: string) => this.deps.userProfile(id)));
    const senderMap = new Map(senders.filter(Boolean).map((sender: any) => [sender.id, sender]));
    return rows.map((message: any) => ({
      ...message,
      sender: senderMap.get(message.sender_id) || { id: message.sender_id, displayName: "Usuario", username: "usuario" },
      receipts: enrichment.receipts.filter((receipt: any) => receipt.message_id === message.id),
      reactions: enrichment.reactions.filter((reaction: any) => reaction.message_id === message.id),
      attachments: enrichment.attachments.filter((attachment: any) => attachment.message_id === message.id),
    }));
  }

  async send(user: any, input: any) {
    await this.deps.rateLimit("messages:" + user.id, 60, 60);
    const conversationId = this.requireConversationId(input.conversationId);
    const body = typeof input.body === "string" ? input.body.trim() : "";
    const nonce = this.deps.str(input.clientNonce, 40);
    const replyTo = input.replyTo ? this.deps.str(input.replyTo, 40) : null;
    const attachmentIds = Array.isArray(input.attachmentIds)
      ? [...new Set(input.attachmentIds.filter((id: unknown) => this.deps.isUuid(id)))].slice(0, 5)
      : [];

    if ([...body].length > MAX_MESSAGE_LENGTH) this.error("El mensaje supera los 4000 caracteres.");
    if (!body && !attachmentIds.length) this.error("Escribe un mensaje o adjunta un archivo.");
    if (!this.deps.isUuid(nonce)) this.error("La clave de envío no es válida.");
    if (replyTo && !this.deps.isUuid(replyTo)) this.error("El mensaje al que respondes no es válido.");

    const { data, error } = await this.repository.sendAtomic(
      user.id,
      conversationId,
      body,
      nonce,
      replyTo,
      attachmentIds,
    );
    if (error || !data) {
      if (error?.code === "42501") this.error("No tienes permiso para enviar ese mensaje o utilizar uno de sus archivos.", 403, "MESSAGE_FORBIDDEN");
      if (error?.code === "23505") this.error("La clave de envío ya fue utilizada.", 409, "MESSAGE_NONCE_CONFLICT");
      if (error?.code === "22023") this.error(error.message || "El mensaje no es válido.", 400, "MESSAGE_INVALID");
      console.error("message_send_failed", error?.code || "unknown");
      this.error("No se pudo guardar el mensaje.", 503, "MESSAGE_SEND_FAILED");
    }
    return data;
  }

  async edit(user: any, input: any) {
    const messageId = this.deps.str(input.messageId, 40);
    const body = typeof input.body === "string" ? input.body.trim() : "";
    if (!this.deps.isUuid(messageId) || !body || [...body].length > MAX_MESSAGE_LENGTH) {
      this.error("Mensaje o contenido no válido.");
    }
    const { data, error } = await this.repository.editAtomic(user.id, messageId, body);
    if (error || !data) {
      if (error?.code === "42501") this.error("No puedes editar este mensaje. Comprueba que sea tuyo, que sigas en la conversación y que no hayan pasado 15 minutos.", 403, "MESSAGE_EDIT_FORBIDDEN");
      this.error("No se pudo editar el mensaje.", 503, "MESSAGE_EDIT_FAILED");
    }
    return data;
  }

  async delete(user: any, input: any) {
    const messageId = this.deps.str(input.messageId, 40);
    if (!this.deps.isUuid(messageId)) this.error("Mensaje no válido.");

    const { data, error } = await this.repository.deleteAtomic(user.id, messageId);
    if (error || !data) {
      if (error?.code === "42501") this.error("Solo puedes eliminar tus propios mensajes de conversaciones a las que todavía perteneces.", 403, "MESSAGE_DELETE_FORBIDDEN");
      this.error("No se pudo eliminar el mensaje.", 503, "MESSAGE_DELETE_FAILED");
    }

    const paths = Array.isArray(data.objectPaths) ? data.objectPaths.filter((path: unknown) => typeof path === "string") : [];
    if (paths.length) {
      const { error: storageError } = await this.repository.removeAttachmentObjects(paths);
      if (storageError) console.warn("deleted_message_attachment_cleanup_failed", storageError.name || "storage_error");
    }
    return { deleted: true };
  }

  async read(user: any, input: any) {
    const conversationId = this.requireConversationId(input.conversationId);
    await this.deps.requireMember(conversationId, user.id);
    const { error } = await this.repository.markRead(user.id, conversationId, this.deps.nowIso());
    if (error) this.error("No se pudo actualizar el estado de lectura.", 503, "MESSAGE_READ_FAILED");
    return { read: true };
  }

  async react(user: any, input: any) {
    const messageId = this.deps.str(input.messageId, 40);
    const emoji = this.deps.str(input.emoji, 16);
    if (!this.deps.isUuid(messageId) || [...emoji].length < 1 || [...emoji].length > 8) {
      this.error("Reacción no válida.");
    }
    const { data, error } = await this.repository.reactAtomic(user.id, messageId, emoji, input.remove === true);
    if (error || data !== true) {
      if (error?.code === "42501") this.error("No puedes reaccionar a este mensaje.", 403, "MESSAGE_REACTION_FORBIDDEN");
      this.error("No se pudo guardar la reacción.", 503, "MESSAGE_REACTION_FAILED");
    }
    return { saved: true, removed: input.remove === true };
  }
}
