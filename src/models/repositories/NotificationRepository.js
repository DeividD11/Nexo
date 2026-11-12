export class NotificationRepository {
  constructor(apiClient) { this.api = apiClient; }
  list() { return this.api.request("notifications.list"); }
  markRead(notificationId) { return this.api.request("notifications.read", { notificationId }); }
  markAllRead() { return this.api.request("notifications.read-all", { all: true }); }
}
