export class GroupRepository {
  constructor(database: any) {
    this.db = database;
  }

  private db: any;

  create(ownerId: string, title: string, description: string, memberIds: string[]) {
    return this.db.rpc("create_group_conversation", {
      p_owner_id: ownerId,
      p_title: title,
      p_description: description,
      p_member_ids: memberIds,
    });
  }

  update(actorId: string, conversationId: string, title: string, description: string) {
    return this.db.rpc("update_group_details", {
      p_actor_id: actorId,
      p_conversation_id: conversationId,
      p_title: title,
      p_description: description,
    });
  }

  setAvatar(actorId: string, conversationId: string, path: string | null) {
    return this.db.rpc("set_group_avatar", {
      p_actor_id: actorId,
      p_conversation_id: conversationId,
      p_avatar_path: path,
    });
  }

  addMember(actorId: string, conversationId: string, targetId: string) {
    return this.db.rpc("add_group_member", {
      p_actor_id: actorId,
      p_conversation_id: conversationId,
      p_target_id: targetId,
    });
  }

  removeMember(actorId: string, conversationId: string, targetId: string) {
    return this.db.rpc("remove_group_member", {
      p_actor_id: actorId,
      p_conversation_id: conversationId,
      p_target_id: targetId,
    });
  }

  setMemberRole(actorId: string, conversationId: string, targetId: string, role: string) {
    return this.db.rpc("set_group_member_role", {
      p_actor_id: actorId,
      p_conversation_id: conversationId,
      p_target_id: targetId,
      p_new_role: role,
    });
  }

  findConversation(conversationId: string) {
    return this.db.from("conversations")
      .select("id,kind,title,avatar_path")
      .eq("id", conversationId)
      .eq("kind", "group")
      .maybeSingle();
  }

  findGroup(conversationId: string) {
    return this.db.from("groups")
      .select("conversation_id,description,created_at,updated_at")
      .eq("conversation_id", conversationId)
      .maybeSingle();
  }

  findActorMembership(conversationId: string, actorId: string) {
    return this.db.from("conversation_members")
      .select("role")
      .eq("conversation_id", conversationId)
      .eq("user_id", actorId)
      .is("left_at", null)
      .maybeSingle();
  }

  listMembers(conversationId: string) {
    return this.db.from("conversation_members")
      .select("user_id,role,joined_at")
      .eq("conversation_id", conversationId)
      .is("left_at", null)
      .order("joined_at", { ascending: true });
  }

  uploadAvatarObject(path: string, file: File, mimeType: string) {
    return this.db.storage.from("messenger-private").upload(path, file, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "3600",
    });
  }

  createAvatarSignedUrl(path: string, expiresIn = 3600) {
    return this.db.storage.from("messenger-private").createSignedUrl(path, expiresIn);
  }

  deleteAvatarObjects(paths: string[]) {
    if (!paths.length) return Promise.resolve({ error: null });
    return this.db.storage.from("messenger-private").remove(paths);
  }
}
