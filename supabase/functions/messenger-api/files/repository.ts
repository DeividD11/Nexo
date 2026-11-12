export class FileRepository {
  constructor(database) { this.db = database; }
  db;
  uploadObject(path, file, mimeType) {
    return this.db.storage.from("messenger-private").upload(path, file, { contentType: mimeType, upsert: false, cacheControl: "3600" });
  }
  registerAttachment(record) {
    return this.db.from("message_attachments").insert(record)
      .select("id,conversation_id,message_id,file_name,mime_type,byte_size,created_at").single();
  }
  findAttachment(id) {
    return this.db.from("message_attachments")
      .select("id,conversation_id,message_id,user_id,object_path,file_name,mime_type,byte_size,deleted_at,created_at")
      .eq("id", id).maybeSingle();
  }
  findMessage(id) {
    return this.db.from("messages").select("id,conversation_id,sender_id,deleted_at").eq("id", id).maybeSingle();
  }
  signUrl(path, expiresIn, options) { return this.db.storage.from("messenger-private").createSignedUrl(path, expiresIn, options); }
  removeObject(path) { return this.db.storage.from("messenger-private").remove([path]); }
  markDeleted(id, userId, now) {
    return this.db.from("message_attachments").update({ deleted_at: now })
      .eq("id", id).eq("user_id", userId).is("deleted_at", null).select("id").maybeSingle();
  }
}
