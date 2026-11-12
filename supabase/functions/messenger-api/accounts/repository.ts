export class AccountRepository {
  constructor(database) { this.db = database; }

  findOwnProfile(userId) {
    return Promise.all([
      this.db.from("users").select("id,email,username,status,created_at").eq("id", userId).eq("status", "active").maybeSingle(),
      this.db.from("user_profiles").select("user_id,display_name,bio,avatar_path,show_last_seen,show_online_status").eq("user_id", userId).maybeSingle(),
    ]);
  }
  updateProfile(userId, username, displayName, bio) {
    return this.db.rpc("update_own_profile", { p_user_id: userId, p_username: username, p_display_name: displayName, p_bio: bio });
  }
  updateAvatarPath(userId, path) {
    return this.db.from("user_profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("user_id", userId).select("user_id,avatar_path").maybeSingle();
  }
  uploadAvatarObject(path, file, mimeType) {
    return this.db.storage.from("messenger-private").upload(path, file, { contentType: mimeType, upsert: false, cacheControl: "3600" });
  }
  deleteAvatarObjects(paths) { return this.db.storage.from("messenger-private").remove(paths); }
  createAvatarSignedUrl(path, expiresIn = 3600) { return this.db.storage.from("messenger-private").createSignedUrl(path, expiresIn); }
  findProfilesByIds(ids) {
    return this.db.from("user_profiles").select("user_id,display_name,bio,avatar_path,show_last_seen,show_online_status").in("user_id", ids);
  }
  findUsersByIds(ids) {
    return this.db.from("users").select("id,username,status").in("id", ids).eq("status", "active");
  }
  findPresenceByIds(ids) {
    return this.db.from("user_presence").select("user_id,last_seen_at,typing_conversation_id,typing_until").in("user_id", ids);
  }
  searchUsersByUsername(query, limit = 20) {
    return this.db.from("users").select("id,username").eq("status", "active").ilike("username", "%" + query + "%").limit(limit);
  }
  searchProfilesByDisplayName(query, limit = 20) {
    return this.db.from("user_profiles").select("user_id").ilike("display_name", "%" + query + "%").limit(limit);
  }
  listContactLinks(userId) {
    return this.db.from("contacts").select("user_a,user_b,created_at").or("user_a.eq." + userId + ",user_b.eq." + userId);
  }
  listIncomingRequests(userId) {
    return this.db.from("contact_requests").select("id,sender_id,receiver_id,created_at").eq("receiver_id", userId).eq("status", "pending").order("created_at", { ascending: false });
  }
  listOutgoingRequests(userId) {
    return this.db.from("contact_requests").select("id,sender_id,receiver_id,created_at").eq("sender_id", userId).eq("status", "pending").order("created_at", { ascending: false });
  }
  listBlockedUsers(userId) {
    return this.db.from("blocked_users").select("blocked_id,created_at").eq("blocker_id", userId).order("created_at", { ascending: false });
  }
  createContactRequest(senderId, receiverId) {
    return this.db.rpc("create_contact_request", { p_sender_id: senderId, p_receiver_id: receiverId });
  }
  respondContactRequest(requestId, receiverId, decision) {
    return this.db.rpc("respond_contact_request", { p_request_id: requestId, p_receiver_id: receiverId, p_decision: decision });
  }
  cancelContactRequest(requestId, senderId) {
    return this.db.from("contact_requests").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", requestId).eq("sender_id", senderId).eq("status", "pending").select("id").maybeSingle();
  }
  removeContact(userId, targetId) {
    return this.db.rpc("remove_contact", { p_user_id: userId, p_target_id: targetId });
  }
  manageBlock(userId, targetId, blocked) {
    return this.db.rpc("manage_user_block", { p_blocker_id: userId, p_target_id: targetId, p_block: blocked });
  }
}
