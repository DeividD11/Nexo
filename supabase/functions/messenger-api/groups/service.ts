import { GroupRepository } from "./repository.ts";

const MAX_GROUP_AVATAR_BYTES = 5 * 1024 * 1024;
const GROUP_AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export class GroupService {
  constructor(database: any, dependencies: any) {
    this.repository = new GroupRepository(database);
    this.deps = dependencies;
  }

  private repository: GroupRepository;
  private deps: any;

  private error(message: string, status = 400, code = "BAD_REQUEST"): never {
    throw new this.deps.ApiError(message, status, code);
  }

  private conversationId(value: unknown): string {
    const id = this.deps.str(value, 40);
    if (!this.deps.isUuid(id)) this.error("Grupo no válido.");
    return id;
  }

  private async requireAdmin(conversationId: string, userId: string) {
    const [conversation, membership] = await Promise.all([
      this.repository.findConversation(conversationId),
      this.repository.findActorMembership(conversationId, userId),
    ]);
    if (!conversation.data || conversation.error || !membership.data || membership.error) {
      this.error("No tienes acceso a este grupo.", 403, "GROUP_FORBIDDEN");
    }
    if (!["owner", "admin"].includes(membership.data.role)) {
      this.error("Esta operación requiere permisos de administrador.", 403, "GROUP_ADMIN_REQUIRED");
    }
    return { conversation: conversation.data, role: membership.data.role };
  }

  async create(user: any, input: any) {
    await this.deps.rateLimit("groups-create:" + user.id, 5, 3600);
    const title = this.deps.str(input.title, 80);
    const description = this.deps.str(input.description, 300);
    const memberIds = Array.isArray(input.memberIds)
      ? [...new Set(input.memberIds.filter((id: unknown) => this.deps.isUuid(id) && id !== user.id))].slice(0, 49)
      : [];
    if ([...title].length < 2 || !memberIds.length) {
      this.error("Un grupo necesita un nombre y al menos un contacto participante.");
    }
    const { data, error } = await this.repository.create(user.id, title, description, memberIds);
    if (error || !data) {
      if (error?.code === "42501") this.error("Todos los participantes deben ser contactos y no puede existir un bloqueo.", 403, "GROUP_CREATE_FORBIDDEN");
      if (error?.code === "P0002") this.error("Uno de los participantes no está disponible.", 404, "GROUP_MEMBER_NOT_FOUND");
      this.error("No se pudo crear el grupo.", 503, "GROUP_CREATE_FAILED");
    }
    return { conversationId: data, created: true };
  }

  async update(user: any, input: any) {
    await this.deps.rateLimit("groups-update:" + user.id, 30, 3600);
    const id = this.conversationId(input.conversationId);
    const title = this.deps.str(input.title, 80);
    const description = this.deps.str(input.description, 300);
    if ([...title].length < 2) this.error("El nombre del grupo debe tener al menos 2 caracteres.");
    const { data, error } = await this.repository.update(user.id, id, title, description);
    if (error || data !== true) {
      if (error?.code === "42501") this.error("Solo el propietario o un administrador puede modificar el grupo.", 403, "GROUP_UPDATE_FORBIDDEN");
      this.error("No se pudo actualizar el grupo.", 503, "GROUP_UPDATE_FAILED");
    }
    return { updated: true };
  }

  async members(user: any, input: any) {
    const id = this.conversationId(input.conversationId);
    await this.deps.requireMember(id, user.id);
    const { data, error } = await this.repository.listMembers(id);
    if (error) this.error("No se pudieron cargar los integrantes.", 503, "GROUP_MEMBERS_FAILED");
    const members = await Promise.all((data || []).map(async (item: any) => ({
      ...(await this.deps.userProfile(item.user_id)),
      role: item.role,
      joinedAt: item.joined_at,
    })));
    return members.filter((item: any) => item.id);
  }

  async addMember(user: any, input: any) {
    await this.deps.rateLimit("groups-add:" + user.id, 40, 3600);
    const id = this.conversationId(input.conversationId);
    const targetId = this.deps.str(input.userId, 40);
    if (!this.deps.isUuid(targetId) || targetId === user.id) this.error("Participante no válido.");
    const { data, error } = await this.repository.addMember(user.id, id, targetId);
    if (error || data !== true) {
      if (error?.code === "42501") this.error("No tienes permiso o el usuario no cumple los requisitos para entrar al grupo.", 403, "GROUP_ADD_FORBIDDEN");
      if (error?.code === "23505") this.error("El usuario ya forma parte del grupo.", 409, "GROUP_MEMBER_EXISTS");
      if (error?.code === "P0002") this.error("El usuario no está disponible.", 404, "GROUP_USER_NOT_FOUND");
      this.error("No se pudo agregar al participante.", 503, "GROUP_ADD_FAILED");
    }
    return { added: true };
  }

  async removeMember(user: any, input: any) {
    const id = this.conversationId(input.conversationId);
    const targetId = this.deps.str(input.userId, 40);
    if (!this.deps.isUuid(targetId)) this.error("Participante no válido.");
    const { data, error } = await this.repository.removeMember(user.id, id, targetId);
    if (error || !data) {
      if (error?.code === "42501") this.error("No tienes permisos para retirar a ese participante.", 403, "GROUP_REMOVE_FORBIDDEN");
      if (error?.code === "P0002") this.error("El grupo o participante ya no está disponible.", 404, "GROUP_MEMBER_NOT_FOUND");
      this.error("No se pudo retirar al participante.", 503, "GROUP_REMOVE_FAILED");
    }
    return data;
  }

  async setRole(user: any, input: any) {
    await this.deps.rateLimit("groups-roles:" + user.id, 40, 3600);
    const id = this.conversationId(input.conversationId);
    const targetId = this.deps.str(input.userId, 40);
    const role = input.role === "admin" ? "admin" : input.role === "member" ? "member" : "";
    if (!this.deps.isUuid(targetId) || !role) this.error("Rol o participante no válido.");
    const { data, error } = await this.repository.setMemberRole(user.id, id, targetId, role);
    if (error || data !== true) {
      if (error?.code === "42501") this.error("Solo el propietario puede cambiar los roles de otros integrantes.", 403, "GROUP_ROLE_FORBIDDEN");
      this.error("No se pudo actualizar el rol.", 503, "GROUP_ROLE_FAILED");
    }
    return { updated: true, role };
  }

  async uploadAvatar(user: any, file: unknown, input: any) {
    await this.deps.rateLimit("groups-avatar:" + user.id, 10, 3600);
    const id = this.conversationId(input.get("conversationId"));
    const { conversation } = await this.requireAdmin(id, user.id);
    if (!(file instanceof File)) this.error("Selecciona una fotografía válida.");
    if (file.size < 1 || file.size > MAX_GROUP_AVATAR_BYTES) this.error("La fotografía del grupo debe pesar como máximo 5 MB.");

    const mime = file.type || "";
    const extension = GROUP_AVATAR_TYPES[mime];
    if (!extension || !(await this.deps.validateFileSignature(file, mime))) {
      this.error("El formato de fotografía no está permitido o el archivo no coincide con su contenido.");
    }

    const path = `groups/${id}/${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await this.repository.uploadAvatarObject(path, file, mime);
    if (uploadError) this.error("No se pudo subir la fotografía del grupo.", 503, "GROUP_AVATAR_UPLOAD_FAILED");

    const { data: oldPath, error: updateError } = await this.repository.setAvatar(user.id, id, path);
    if (updateError) {
      await this.repository.deleteAvatarObjects([path]);
      if (updateError.code === "42501") this.error("No tienes permiso para cambiar la fotografía del grupo.", 403, "GROUP_AVATAR_FORBIDDEN");
      this.error("No se pudo guardar la fotografía del grupo.", 503, "GROUP_AVATAR_UPDATE_FAILED");
    }

    if (oldPath && oldPath.startsWith(`groups/${id}/`) && oldPath !== path) {
      const { error } = await this.repository.deleteAvatarObjects([oldPath]);
      if (error) console.warn("old_group_avatar_cleanup_failed", error.name || "storage_error");
    }

    const { data: signed } = await this.repository.createAvatarSignedUrl(path, 3600);
    return { avatarUrl: signed?.signedUrl || null, message: "Fotografía del grupo actualizada." };
  }

  async deleteAvatar(user: any, input: any) {
    const id = this.conversationId(input.conversationId);
    const { conversation } = await this.requireAdmin(id, user.id);
    const oldPath = conversation.avatar_path;
    if (!oldPath) return { avatarUrl: null, message: "El grupo no tiene fotografía." };
    if (!oldPath.startsWith(`groups/${id}/`)) this.error("La fotografía no pertenece a este grupo.", 403, "GROUP_AVATAR_FORBIDDEN");

    const { error } = await this.repository.setAvatar(user.id, id, null);
    if (error) this.error("No se pudo eliminar la fotografía del grupo.", 503, "GROUP_AVATAR_DELETE_FAILED");
    const { error: storageError } = await this.repository.deleteAvatarObjects([oldPath]);
    if (storageError) console.warn("group_avatar_delete_failed", storageError.name || "storage_error");
    return { avatarUrl: null, message: "Fotografía del grupo eliminada." };
  }
}
