export class Profile {
  constructor(data = {}) {
    this.id = data.id || "";
    this.email = data.email || "";
    this.username = data.username || "";
    this.displayName = data.displayName || data.username || "Usuario";
    this.bio = data.bio || "";
    this.avatarUrl = data.avatarUrl || null;
    this.createdAt = data.createdAt || null;
    this.showLastSeen = data.showLastSeen !== false;
    this.showOnlineStatus = data.showOnlineStatus !== false;
  }
}
