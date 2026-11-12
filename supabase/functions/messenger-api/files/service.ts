import { FileRepository } from "./repository.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/gif": ["gif"],
  "application/pdf": ["pdf"], "text/plain": ["txt"], "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/zip": ["zip"],
};

export class FileService {
  constructor(database, deps) { this.repository = new FileRepository(database); this.deps = deps; }
  repository;
  deps;
  error(message, status = 400, code = "BAD_REQUEST") { throw new this.deps.ApiError(message, status, code); }
  id(value) {
    const id = this.deps.str(value, 40);
    if (!this.deps.isUuid(id)) this.error("Identificador de archivo no válido.");
    return id;
  }
  safePath(attachment) {
    const prefix = attachment.conversation_id + "/" + attachment.user_id + "/";
    if (typeof attachment.object_path !== "string" || !attachment.object_path.startsWith(prefix) ||
        attachment.object_path.includes("..") || attachment.object_path.startsWith("/")) {
      this.error("La ruta almacenada del archivo no es válida.", 403, "ATTACHMENT_PATH_INVALID");
    }
    return attachment.object_path;
  }

  async upload(user, input) {
    await this.deps.rateLimit("uploads:" + user.id, 30, 3600);
    const conversationId = this.deps.str(input?.get?.("conversationId"), 40);
    if (!this.deps.isUuid(conversationId)) this.error("Conversación no válida.");
    await this.deps.requireMember(conversationId, user.id);
    const file = input?.get?.("file");
    if (!(file instanceof File)) this.error("No se recibió un archivo válido.");
    if (file.size < 1 || file.size > MAX_FILE_BYTES) this.error("El archivo debe pesar entre 1 byte y 10 MB.");
    const mime = (file.type || "").toLowerCase();
    const allowedExtensions = ALLOWED_FILE_TYPES[mime];
    if (!allowedExtensions || !(await this.deps.validateFileSignature(file, mime))) {
      this.error("El formato del archivo no está permitido o no coincide con su contenido.");
    }
    const sourceName = typeof file.name === "string" ? file.name : "";
    const safeName = sourceName.replaceAll("/", "_").replaceAll(String.fromCharCode(92), "_")
      .replace(/[\u0000-\u001f\u007f]/g, "_").replace(/^\.+/, "").trim().slice(0, 150);
    const extension = safeName.includes(".") ? safeName.split(".").pop().toLowerCase() : "";
    if (!safeName || !allowedExtensions.includes(extension)) this.error("La extensión del archivo no coincide con su tipo MIME.");
    const path = conversationId + "/" + user.id + "/" + crypto.randomUUID() + "/" + safeName;
    const { error: uploadError } = await this.repository.uploadObject(path, file, mime);
    if (uploadError) {
      console.error("file_upload_failed", uploadError.name || "storage_error");
      this.error("No se pudo subir el archivo.", 503, "FILE_UPLOAD_FAILED");
    }
    const { data, error } = await this.repository.registerAttachment({
      conversation_id: conversationId, user_id: user.id, object_path: path,
      file_name: safeName, mime_type: mime, byte_size: file.size,
    });
    if (error || !data) {
      const { error: cleanupError } = await this.repository.removeObject(path);
      if (cleanupError) console.error("orphan_upload_cleanup_failed", cleanupError.name || "storage_error");
      console.error("file_metadata_insert_failed", error?.code || "unknown");
      this.error("No se pudo registrar el archivo adjunto.", 503, "FILE_REGISTER_FAILED");
    }
    return {
      id: data.id, conversationId: data.conversation_id, fileName: data.file_name,
      mimeType: data.mime_type, byteSize: Number(data.byte_size), createdAt: data.created_at,
      isImage: mime.startsWith("image/"),
    };
  }

  async signedUrl(user, input) {
    await this.deps.rateLimit("file-url:" + user.id, 120, 300);
    const id = this.id(input.attachmentId);
    const { data: attachment, error } = await this.repository.findAttachment(id);
    if (error || !attachment || attachment.deleted_at) this.error("Archivo no encontrado.", 404, "FILE_NOT_FOUND");
    await this.deps.requireMember(attachment.conversation_id, user.id);
    const path = this.safePath(attachment);
    const isImage = attachment.mime_type.startsWith("image/");
    if (!attachment.message_id) {
      if (attachment.user_id !== user.id) this.error("El archivo todavía no está disponible para otros participantes.", 403, "FILE_NOT_SHARED");
    } else {
      const { data: message, error: messageError } = await this.repository.findMessage(attachment.message_id);
      if (messageError || !message || message.conversation_id !== attachment.conversation_id || message.deleted_at) {
        this.error("El mensaje que contenía este archivo ya no está disponible.", 404, "FILE_NOT_FOUND");
      }
    }
    const mode = input.mode === "preview" && isImage ? "preview" : "download";
    const options = mode === "download" ? { download: attachment.file_name } : { download: false };
    const { data, error: signError } = await this.repository.signUrl(path, 120, options);
    if (signError || !data?.signedUrl) {
      console.error("file_signed_url_failed", signError?.name || "storage_error");
      this.error("No se pudo preparar el archivo.", 503, "FILE_URL_FAILED");
    }
    return {
      url: data.signedUrl, expiresIn: 120, fileName: attachment.file_name,
      mimeType: attachment.mime_type, byteSize: Number(attachment.byte_size), isImage, mode,
    };
  }

  async delete(user, input) {
    await this.deps.rateLimit("file-delete:" + user.id, 40, 3600);
    const id = this.id(input.attachmentId);
    const { data: attachment, error } = await this.repository.findAttachment(id);
    if (error || !attachment) this.error("Archivo no encontrado.", 404, "FILE_NOT_FOUND");
    await this.deps.requireMember(attachment.conversation_id, user.id);
    if (attachment.user_id !== user.id) this.error("Solo quien subió el archivo puede eliminarlo.", 403, "FILE_DELETE_FORBIDDEN");
    const path = this.safePath(attachment);
    if (attachment.message_id) {
      const { data: message, error: messageError } = await this.repository.findMessage(attachment.message_id);
      if (messageError || !message || message.sender_id !== user.id) {
        this.error("Solo quien envió el mensaje que contiene el archivo puede eliminarlo.", 403, "FILE_DELETE_FORBIDDEN");
      }
    }
    if (!attachment.deleted_at) {
      const { error: markError } = await this.repository.markDeleted(id, user.id, this.deps.nowIso());
      if (markError) this.error("No se pudo bloquear el acceso al archivo.", 503, "FILE_DELETE_FAILED");
    }
    const { error: storageError } = await this.repository.removeObject(path);
    if (storageError) {
      console.error("file_storage_cleanup_failed", storageError.name || "storage_error");
      this.error("El acceso al archivo quedó bloqueado, pero no se pudo completar su eliminación física. Vuelve a intentarlo.", 503, "FILE_CLEANUP_PENDING");
    }
    return { deleted: true };
  }
}
