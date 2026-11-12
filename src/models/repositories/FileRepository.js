export class FileRepository {
  constructor(apiClient) { this.api = apiClient; }

  upload(conversationId, file) {
    const form = new FormData();
    form.set("action", "files.upload");
    form.set("conversationId", conversationId);
    form.set("file", file, file.name || "archivo");
    return this.api.requestMultipart(form);
  }

  url(attachmentId, mode = "download") {
    return this.api.request("files.url", { attachmentId, mode });
  }

  delete(attachmentId) {
    return this.api.request("files.delete", { attachmentId });
  }
}
