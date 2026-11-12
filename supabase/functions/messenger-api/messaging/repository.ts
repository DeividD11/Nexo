export class MessagingRepository {
  constructor(database: any) {
    this.db = database;
  }

  private db: any;

  listMessages(conversationId: string, limit: number, before: string | null, after: string | null, afterId: string | null, beforeId: string | null) {
    let query = this.db.from("messages")
      .select("id,conversation_id,sender_id,body,message_type,reply_to,client_nonce,created_at,edited_at,deleted_at,deleted_for_all,metadata")
      .eq("conversation_id", conversationId)
      .limit(limit);

    if (after) {
      if (afterId) {
        query = query.or(`created_at.gt.${after},and(created_at.eq.${after},id.gt.${afterId})`);
      } else {
        query = query.gt("created_at", after);
      }
      return query.order("created_at", { ascending: true }).order("id", { ascending: true });
    }

    if (before) {
      if (beforeId) query = query.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`);
      else query = query.lt("created_at", before);
    }
    return query.order("created_at", { ascending: false }).order("id", { ascending: false });
  }

  markDelivered(userId: string, messageIds: string[]) {
    if (!messageIds.length) return Promise.resolve({ error: null });
    return this.db.from("message_receipts")
      .update({ delivered_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("message_id", messageIds)
      .is("delivered_at", null);
  }

  async loadEnrichment(messageIds: string[]) {
    if (!messageIds.length) return { receipts: [], reactions: [], attachments: [] };
    const [receipts, reactions, attachments] = await Promise.all([
      this.db.from("message_receipts")
        .select("message_id,user_id,delivered_at,read_at")
        .in("message_id", messageIds),
      this.db.from("message_reactions")
        .select("message_id,user_id,emoji,created_at")
        .in("message_id", messageIds),
      this.db.from("message_attachments")
        .select("id,message_id,file_name,mime_type,byte_size")
        .in("message_id", messageIds)
        .is("deleted_at", null),
    ]);
    if (receipts.error || reactions.error || attachments.error) {
      return { error: receipts.error || reactions.error || attachments.error };
    }
    return {
      receipts: receipts.data || [],
      reactions: reactions.data || [],
      attachments: attachments.data || [],
    };
  }

  sendAtomic(senderId: string, conversationId: string, body: string, clientNonce: string, replyTo: string | null, attachmentIds: string[]) {
    return this.db.rpc("send_message_atomic", {
      p_sender_id: senderId,
      p_conversation_id: conversationId,
      p_body: body,
      p_client_nonce: clientNonce,
      p_reply_to: replyTo,
      p_attachment_ids: attachmentIds,
    });
  }

  editAtomic(userId: string, messageId: string, body: string) {
    return this.db.rpc("edit_conversation_message", {
      p_user_id: userId,
      p_message_id: messageId,
      p_body: body,
    });
  }

  deleteAtomic(userId: string, messageId: string) {
    return this.db.rpc("delete_conversation_message", {
      p_user_id: userId,
      p_message_id: messageId,
    });
  }

  reactAtomic(userId: string, messageId: string, emoji: string, remove: boolean) {
    return this.db.rpc("react_to_conversation_message", {
      p_user_id: userId,
      p_message_id: messageId,
      p_emoji: emoji,
      p_remove: remove,
    });
  }

  async markRead(userId: string, conversationId: string, now: string) {
    const { data: messages, error: messagesError } = await this.db.from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (messagesError) return { error: messagesError };

    const ids = (messages || []).map((message: any) => message.id);
    if (ids.length) {
      const { error } = await this.db.from("message_receipts")
        .update({ read_at: now })
        .eq("user_id", userId)
        .in("message_id", ids)
        .is("read_at", null);
      if (error) return { error };
    }

    const { error: memberError } = await this.db.from("conversation_members")
      .update({ last_read_at: now })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .is("left_at", null);
    return { error: memberError };
  }

  removeAttachmentObjects(paths: string[]) {
    if (!paths.length) return Promise.resolve({ error: null });
    return this.db.storage.from("messenger-private").remove(paths);
  }
}
