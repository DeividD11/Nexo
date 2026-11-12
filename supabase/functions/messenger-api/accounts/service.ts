import { AccountRepository } from "./repository.ts";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export class AccountService {
  constructor(database, deps) {
    this.repository = new AccountRepository(database);
    this.deps = deps;
  }

  error(message, status = 400, code = "BAD_REQUEST") {
    throw new this.deps.ApiError(message, status, code);
  }

  async signedAvatar(path, ownerId) {
    if (!path || !path.startsWith("avatars/" + ownerId + "/")) return null;
    const { data, error } = await this.repository.createAvatarSignedUrl(path, 3600);
    if (error || !data || !data.signedUrl) {
      if (error) console.warn("avatar_signed_url_failed", error.name || "storage_error");
      return null;
    }
    return data.signedUrl;
  }

  async publicProfileMap(ids) {
    const uniqueIds = [...new Set(ids)].slice(0, 100);
    if (!uniqueIds.length) return new Map();
    const [usersResult, profilesResult, presenceResult] = await Promise.all([
      this.repository.findUsersByIds(uniqueIds),
      this.repository.findProfilesByIds(uniqueIds),
      this.repository.findPresenceByIds(uniqueIds),
    ]);
    if (usersResult.error || profilesResult.error || presenceResult.error) {
      this.error("No se pudieron cargar los perfiles.", 503, "PROFILE_LOOKUP_FAILED");
    }
    const profiles = new Map((profilesResult.data || []).map((p) => [p.user_id, p]));
    const presence = new Map((presenceResult.data || []).map((p) => [p.user_id, p]));
    const result = new Map();
    for (const user of usersResult.data || []) {
      const profile = profiles.get(user.id) || {};
      const activity = presence.get(user.id) || null;
      const presenceVisible = profile.show_online_status !== false;
      const online = !!activity && Date.now() - new Date(activity.last_seen_at).getTime() < 90000;
      result.set(user.id, {
        id: user.id,
        username: user.username,
        displayName: profile.display_name || user.username,
        bio: profile.bio || "",
        avatarUrl: await this.signedAvatar(profile.avatar_path, user.id),
        online: presenceVisible && online,
        lastSeen: presenceVisible && profile.show_last_seen !== false ? (activity ? activity.last_seen_at : null) : null,
        typingConversationId: presenceVisible && activity && activity.typing_until &&
          new Date(activity.typing_until).getTime() > Date.now() ? activity.typing_conversation_id : null,
      });
    }
    return result;
  }

  async getProfile(user) {
    const [userResult, profileResult] = await this.repository.findOwnProfile(user.id);
    if (userResult.error || profileResult.error || !userResult.data || !profileResult.data) {
      this.error("No se pudo cargar tu perfil.", 503, "PROFILE_LOOKUP_FAILED");
    }
    const dbUser = userResult.data;
    const profile = profileResult.data;
    return {
      id: dbUser.id,
      email: dbUser.email,
      username: dbUser.username,
      displayName: profile.display_name || dbUser.username,
      bio: profile.bio || "",
      avatarUrl: await this.signedAvatar(profile.avatar_path, user.id),
      showLastSeen: profile.show_last_seen !== false,
      showOnlineStatus: profile.show_online_status !== false,
      createdAt: dbUser.created_at,
    };
  }

  async updateProfile(user, input) {
    await this.deps.rateLimit("profile-update:" + user.id, 20, 900);
    const username = this.deps.str(input.username, 24).toLowerCase();
    const displayName = this.deps.str(input.displayName, 80);
    const bio = typeof input.bio === "string" ? input.bio.trim() : "";
    if (!/^[a-z0-9_.]{3,24}$/.test(username)) this.error("El nombre de usuario debe tener entre 3 y 24 caracteres y usar letras, números, punto o guion bajo.");
    if ([...displayName].length < 2 || [...displayName].length > 80) this.error("El nombre visible debe tener entre 2 y 80 caracteres.");
    if ([...bio].length > 300) this.error("La biografía no puede superar los 300 caracteres.");
    const { data, error } = await this.repository.updateProfile(user.id, username, displayName, bio);
    if (error || !data) {
      if (error && error.code === "23505") this.error("Ese nombre de usuario ya está en uso.", 409, "USERNAME_TAKEN");
      if (error && error.code === "42501") this.error("La cuenta no está disponible.", 403, "ACCOUNT_UNAVAILABLE");
      console.error("profile_update_failed", error ? error.code : "unknown");
      this.error("No se pudo actualizar el perfil.", 503, "PROFILE_UPDATE_FAILED");
    }
    return {
      id: data.id, email: data.email, username: data.username,
      displayName: data.display_name, bio: data.bio,
      avatarUrl: await this.signedAvatar(data.avatar_path, user.id), createdAt: data.created_at,
    };
  }

  async uploadAvatar(user, file) {
    await this.deps.rateLimit("avatar-upload:" + user.id, 10, 3600);
    if (!(file instanceof File)) this.error("Selecciona una fotografía válida.");
    if (file.size < 1 || file.size > MAX_AVATAR_BYTES) this.error("La fotografía debe pesar como máximo 5 MB.");
    const mime = file.type || "";
    const extension = AVATAR_TYPES[mime];
    if (!extension || !(await this.deps.validateFileSignature(file, mime))) {
      this.error("El formato de fotografía no está permitido o el archivo no coincide con su contenido.");
    }
    const [_userResult, profileResult] = await this.repository.findOwnProfile(user.id);
    if (profileResult.error || !profileResult.data) this.error("No se pudo cargar tu perfil.", 503, "PROFILE_LOOKUP_FAILED");
    const oldPath = profileResult.data.avatar_path;
    const path = "avatars/" + user.id + "/" + crypto.randomUUID() + "." + extension;
    const { error: uploadError } = await this.repository.uploadAvatarObject(path, file, mime);
    if (uploadError) {
      console.error("avatar_upload_failed", uploadError.name || "storage_error");
      this.error("No se pudo subir la fotografía.", 503, "AVATAR_UPLOAD_FAILED");
    }
    const { data: updated, error: updateError } = await this.repository.updateAvatarPath(user.id, path);
    if (updateError || !updated) {
      await this.repository.deleteAvatarObjects([path]);
      this.error("No se pudo guardar la fotografía en el perfil.", 503, "AVATAR_PROFILE_UPDATE_FAILED");
    }
    if (oldPath && oldPath.startsWith("avatars/" + user.id + "/") && oldPath !== path) {
      const { error: cleanupError } = await this.repository.deleteAvatarObjects([oldPath]);
      if (cleanupError) console.warn("old_avatar_cleanup_failed", cleanupError.name || "storage_error");
    }
    return { avatarUrl: await this.signedAvatar(path, user.id), message: "Fotografía actualizada." };
  }

  async deleteAvatar(user) {
    const [_userResult, profileResult] = await this.repository.findOwnProfile(user.id);
    if (profileResult.error || !profileResult.data) this.error("No se pudo cargar tu perfil.", 503, "PROFILE_LOOKUP_FAILED");
    const path = profileResult.data.avatar_path;
    if (!path) return { avatarUrl: null, message: "No hay fotografía para eliminar." };
    if (!path.startsWith("avatars/" + user.id + "/")) this.error("La fotografía no pertenece a esta cuenta.", 403, "AVATAR_FORBIDDEN");
    const { data, error } = await this.repository.updateAvatarPath(user.id, null);
    if (error || !data) this.error("No se pudo actualizar el perfil.", 503, "AVATAR_PROFILE_UPDATE_FAILED");
    const { error: deleteError } = await this.repository.deleteAvatarObjects([path]);
    if (deleteError) console.warn("avatar_delete_failed", deleteError.name || "storage_error");
    return { avatarUrl: null, message: "Fotografía eliminada." };
  }

  async searchUsers(user, input) {
    await this.deps.rateLimit("search:" + user.id, 50, 60);
    const query = this.deps.str(input.query, 60).replace(/[%_*(),]/g, " ").replace(/\s+/g, " ").trim();
    if ([...query].length < 2) return [];
    const [usersResult, profilesResult] = await Promise.all([
      this.repository.searchUsersByUsername(query, 20),
      this.repository.searchProfilesByDisplayName(query, 20),
    ]);
    if (usersResult.error || profilesResult.error) this.error("No se pudo realizar la búsqueda.", 503, "USER_SEARCH_FAILED");
    const ids = [...new Set([
      ...(usersResult.data || []).map((item) => item.id),
      ...(profilesResult.data || []).map((item) => item.user_id),
    ])].filter((id) => id !== user.id).slice(0, 20);
    const profiles = await this.publicProfileMap(ids);
    return ids.map((id) => profiles.get(id)).filter(Boolean);
  }

  async listContacts(user) {
    const [linksResult, incomingResult, outgoingResult] = await Promise.all([
      this.repository.listContactLinks(user.id),
      this.repository.listIncomingRequests(user.id),
      this.repository.listOutgoingRequests(user.id),
    ]);
    if (linksResult.error || incomingResult.error || outgoingResult.error) this.error("No se pudieron cargar tus contactos.", 503, "CONTACTS_LOOKUP_FAILED");
    const links = linksResult.data || [];
    const incoming = incomingResult.data || [];
    const outgoing = outgoingResult.data || [];
    const ids = [...new Set([
      ...links.map((item) => item.user_a === user.id ? item.user_b : item.user_a),
      ...incoming.map((item) => item.sender_id),
      ...outgoing.map((item) => item.receiver_id),
    ])];
    const profiles = await this.publicProfileMap(ids);
    return {
      contacts: links.map((item) => profiles.get(item.user_a === user.id ? item.user_b : item.user_a)).filter(Boolean),
      incoming: incoming.map((item) => ({ id: item.id, user: profiles.get(item.sender_id) || null, createdAt: item.created_at })),
      outgoing: outgoing.map((item) => ({ id: item.id, user: profiles.get(item.receiver_id) || null, createdAt: item.created_at })),
    };
  }

  async listBlockedUsers(user) {
    const { data, error } = await this.repository.listBlockedUsers(user.id);
    if (error) this.error("No se pudo cargar la lista de bloqueados.", 503, "BLOCK_LIST_FAILED");
    const profiles = await this.publicProfileMap((data || []).map((item) => item.blocked_id));
    return (data || []).map((item) => ({ ...profiles.get(item.blocked_id), blockedAt: item.created_at })).filter((item) => item.id);
  }

  async requestContact(user, input) {
    await this.deps.rateLimit("contact-requests:" + user.id, 15, 3600);
    const targetId = this.deps.str(input.userId, 40);
    if (!this.deps.isUuid(targetId) || targetId === user.id) this.error("Usuario no válido.");
    const { data, error } = await this.repository.createContactRequest(user.id, targetId);
    if (error || !data) {
      if (error && error.code === "23505") this.error("Ya existe una relación o solicitud pendiente.", 409, "CONTACT_REQUEST_EXISTS");
      if (error && error.code === "42501") this.error("No es posible enviar una solicitud a este usuario.", 403, "CONTACT_REQUEST_FORBIDDEN");
      console.error("contact_request_failed", error ? error.code : "unknown");
      this.error("No se pudo enviar la solicitud.", 503, "CONTACT_REQUEST_FAILED");
    }
    return data;
  }

  async respondContact(user, input) {
    await this.deps.rateLimit("contact-response:" + user.id, 40, 3600);
    const requestId = this.deps.str(input.requestId, 40);
    const decision = input.decision === "accept" ? "accept" : input.decision === "reject" ? "reject" : "";
    if (!this.deps.isUuid(requestId) || !decision) this.error("La respuesta a la solicitud no es válida.");
    const { data, error } = await this.repository.respondContactRequest(requestId, user.id, decision);
    if (error || !data) {
      if (error && error.code === "P0002") this.error("La solicitud ya no está disponible.", 404, "CONTACT_REQUEST_NOT_FOUND");
      if (error && error.code === "42501") this.error("No se puede aceptar esta solicitud por las restricciones de bloqueo.", 403, "CONTACT_REQUEST_FORBIDDEN");
      this.error("No se pudo responder la solicitud.", 503, "CONTACT_RESPONSE_FAILED");
    }
    return data;
  }

  async cancelContact(user, input) {
    const requestId = this.deps.str(input.requestId, 40);
    if (!this.deps.isUuid(requestId)) this.error("Solicitud no válida.");
    const { data, error } = await this.repository.cancelContactRequest(requestId, user.id);
    if (error) this.error("No se pudo cancelar la solicitud.", 503, "CONTACT_CANCEL_FAILED");
    if (!data) this.error("La solicitud no existe o ya no está pendiente.", 404, "CONTACT_REQUEST_NOT_FOUND");
    return { cancelled: true };
  }

  async removeContact(user, input) {
    await this.deps.rateLimit("contact-remove:" + user.id, 30, 3600);
    const targetId = this.deps.str(input.userId, 40);
    if (!this.deps.isUuid(targetId) || targetId === user.id) this.error("Usuario no válido.");
    const { data, error } = await this.repository.removeContact(user.id, targetId);
    if (error) this.error("No se pudo eliminar el contacto.", 503, "CONTACT_REMOVE_FAILED");
    return { removed: data === true };
  }

  async setBlocked(user, input) {
    await this.deps.rateLimit("user-block:" + user.id, 30, 3600);
    const targetId = this.deps.str(input.userId, 40);
    if (!this.deps.isUuid(targetId) || targetId === user.id) this.error("Usuario no válido.");
    const blocked = input.blocked !== false;
    const { data, error } = await this.repository.manageBlock(user.id, targetId, blocked);
    if (error || data !== blocked) {
      if (error && error.code === "P0002") this.error("El usuario no está disponible.", 404, "USER_NOT_FOUND");
      this.error("No se pudo actualizar el bloqueo.", 503, "BLOCK_UPDATE_FAILED");
    }
    return { blocked };
  }
}
