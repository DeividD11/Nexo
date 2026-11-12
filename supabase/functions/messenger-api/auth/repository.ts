export class AuthRepository {
  private db: any;

  constructor(database: any) {
    this.db = database;
  }

  createUser(email: string, username: string, passwordHash: string) {
    return this.db.from("users").insert({ email, username, password_hash: passwordHash })
      .select("id,email,username,status,created_at").single();
  }
  createUserRelations(userId: string, displayName: string) {
    return Promise.all([
      this.db.from("user_profiles").insert({ user_id: userId, display_name: displayName }),
      this.db.from("user_settings").insert({ user_id: userId }),
      this.db.from("user_presence").insert({ user_id: userId }),
    ]);
  }
  deleteUser(userId: string) { return this.db.from("users").delete().eq("id", userId); }
  findLoginUserByEmail(email: string) {
    return this.db.from("users").select("id,email,username,password_hash,status,created_at").eq("email", email).maybeSingle();
  }
  findLoginUserByUsername(username: string) {
    return this.db.from("users").select("id,email,username,password_hash,status,created_at").eq("username", username).maybeSingle();
  }
  findUserById(userId: string) {
    return this.db.from("users").select("id,email,username,status,created_at").eq("id", userId).maybeSingle();
  }
  findRecoveryUser(email: string) {
    return this.db.from("users").select("id,email,status").eq("email", email).maybeSingle();
  }
  findProfile(userId: string) {
    return this.db.from("user_profiles").select("display_name,bio,avatar_path,show_last_seen,show_online_status").eq("user_id", userId).maybeSingle();
  }
  createSession(record: Record<string, unknown>) {
    return this.db.from("user_sessions").insert(record).select("id").single();
  }
  recordDevice(userId: string, deviceLabel: string) {
    return this.db.from("user_devices").insert({ user_id: userId, device_label: deviceLabel });
  }
  findSessionByAccessHash(tokenHash: string, now: string) {
    return this.db.from("user_sessions").select("id,user_id,expires_at,revoked_at,last_seen_at")
      .eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", now).maybeSingle();
  }
  touchSession(sessionId: string, userId: string, now: string) {
    return this.db.from("user_sessions").update({ last_seen_at: now }).eq("id", sessionId).eq("user_id", userId);
  }
  findSessionByRefreshHash(refreshHash: string, now: string) {
    return this.db.from("user_sessions").select("id,user_id,device_label")
      .eq("refresh_token_hash", refreshHash).is("revoked_at", null).gt("refresh_expires_at", now).maybeSingle();
  }
  rotateSession(sessionId: string, oldRefreshHash: string, record: Record<string, unknown>, now: string) {
    return this.db.from("user_sessions").update(record).eq("id", sessionId).eq("refresh_token_hash", oldRefreshHash)
      .is("revoked_at", null).gt("refresh_expires_at", now).select("id").maybeSingle();
  }
  invalidateOpenResetTokens(userId: string, now: string) {
    return this.db.from("password_reset_tokens").update({ used_at: now }).eq("user_id", userId).is("used_at", null);
  }
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: string) {
    return this.db.from("password_reset_tokens").insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });
  }
  invalidatePasswordResetToken(tokenHash: string, now: string) {
    return this.db.from("password_reset_tokens").update({ used_at: now }).eq("token_hash", tokenHash).is("used_at", null);
  }
  consumePasswordReset(tokenHash: string, passwordHash: string) {
    return this.db.rpc("consume_password_reset", { p_token_hash: tokenHash, p_password_hash: passwordHash });
  }
  closeSession(sessionId: string, userId: string, now: string) {
    return this.db.from("user_sessions").update({ revoked_at: now, refresh_token_hash: null, refresh_expires_at: null })
      .eq("id", sessionId).eq("user_id", userId).is("revoked_at", null);
  }
  listSessions(userId: string) {
    return this.db.from("user_sessions").select("id,device_label,user_agent,created_at,last_seen_at,expires_at,refresh_expires_at")
      .eq("user_id", userId).is("revoked_at", null).order("last_seen_at", { ascending: false });
  }
  revokeOtherSessions(currentSessionId: string, userId: string, now: string) {
    return this.db.from("user_sessions").update({ revoked_at: now, refresh_token_hash: null, refresh_expires_at: null })
      .eq("user_id", userId).neq("id", currentSessionId).is("revoked_at", null).select("id");
  }
  revokeSession(sessionId: string, userId: string, now: string) {
    return this.db.from("user_sessions").update({ revoked_at: now, refresh_token_hash: null, refresh_expires_at: null })
      .eq("id", sessionId).eq("user_id", userId).is("revoked_at", null).select("id").maybeSingle();
  }
}
