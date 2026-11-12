import { NotificationRepository } from "./repository.ts";

export class NotificationService {
  constructor(database, deps) { this.repository = new NotificationRepository(database); this.deps = deps; }
  repository;
  deps;
  error(message, status = 400, code = "BAD_REQUEST") { throw new this.deps.ApiError(message, status, code); }
  async list(user) {
    await this.deps.rateLimit("notifications:" + user.id, 120, 300);
    const [itemsResult, countResult] = await Promise.all([
      this.repository.listForUser(user.id, 60), this.repository.countUnread(user.id),
    ]);
    if (itemsResult.error || countResult.error) this.error("No se pudieron cargar las notificaciones.", 503, "NOTIFICATIONS_LOOKUP_FAILED");
    return { items: itemsResult.data || [], unreadCount: countResult.count || 0 };
  }
  async markRead(user, input, all = false) {
    await this.deps.rateLimit("notifications-read:" + user.id, 120, 300);
    if (all || input.all === true) {
      const { error } = await this.repository.markAll(user.id, this.deps.nowIso());
      if (error) this.error("No se pudieron marcar las notificaciones.", 503, "NOTIFICATIONS_UPDATE_FAILED");
      return { read: true, all: true };
    }
    const id = this.deps.str(input.notificationId, 40);
    if (!this.deps.isUuid(id)) this.error("Notificación no válida.");
    const { data, error } = await this.repository.markOne(user.id, id, this.deps.nowIso());
    if (error) this.error("No se pudo actualizar la notificación.", 503, "NOTIFICATION_UPDATE_FAILED");
    return { read: true, updated: !!data };
  }
}
