const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

export class AttachmentController {
  constructor(model, view) { this.model = model; this.view = view; this.uploading = false; }

  async uploadFromInput(input) {
    const conversation = this.model.state.activeConversation;
    const files = [...(input.files || [])];
    input.value = "";
    if (!conversation || !files.length) return;
    if (this.uploading) return this.view.toast("Ya hay una carga en curso.", "error");
    const pending = this.model.state.pendingAttachments || [];
    if (pending.length + files.length > MAX_ATTACHMENTS) {
      return this.view.toast("Puedes adjuntar como máximo 5 archivos por mensaje.", "error");
    }
    this.uploading = true;
    try {
      for (const file of files) {
        if (file.size < 1 || file.size > MAX_FILE_BYTES) {
          this.view.toast(`${file.name}: el límite es 10 MB.`, "error");
          continue;
        }
        if (!ALLOWED_TYPES.has(file.type)) {
          this.view.toast(`${file.name}: tipo de archivo no permitido.`, "error");
          continue;
        }
        try {
          const uploaded = await this.model.files.upload(conversation.id, file);
          const previewObjectUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
          if (this.model.state.activeConversation?.id !== conversation.id) {
            if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
            await this.model.files.delete(uploaded.id).catch(() => {});
            break;
          }
          this.model.update({ pendingAttachments: [...this.model.state.pendingAttachments, { ...uploaded, previewObjectUrl }] });
        } catch (error) {
          this.view.toast(`${file.name}: ${error.message}`, "error");
        }
      }
    } finally {
      this.uploading = false;
    }
  }

  async removePending(attachmentId) {
    const attachment = (this.model.state.pendingAttachments || []).find((item) => item.id === attachmentId);
    if (!attachment) return;
    try {
      await this.model.files.delete(attachment.id);
      if (attachment.previewObjectUrl) URL.revokeObjectURL(attachment.previewObjectUrl);
      this.model.update({ pendingAttachments: this.model.state.pendingAttachments.filter((item) => item.id !== attachmentId) });
      this.view.toast("Adjunto retirado.");
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  async open(attachment) {
    if (!attachment?.id) return;
    try {
      const mode = String(attachment.mime_type || attachment.mimeType || "").startsWith("image/") ? "preview" : "download";
      const data = await this.model.files.url(attachment.id, mode);
      if (data.isImage && mode === "preview") {
        this.model.update({ modal: { type: "file-preview", title: data.fileName, fileUrl: data.url, fileName: data.fileName, mimeType: data.mimeType } });
        this.view.focusModal();
      } else {
        const link = document.createElement("a");
        link.href = data.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.download = data.fileName;
        document.body.append(link);
        link.click();
        link.remove();
      }
    } catch (error) { this.view.toast(error.message, "error"); }
  }

  disposePending() {
    for (const attachment of this.model.state.pendingAttachments || []) {
      if (attachment.previewObjectUrl) URL.revokeObjectURL(attachment.previewObjectUrl);
      this.model.files.delete(attachment.id).catch(() => {});
    }
    this.model.update({ pendingAttachments: [] });
  }
}
