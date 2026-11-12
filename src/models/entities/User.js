export class User {
  constructor(data = {}) {
    this.id = data.id || "";
    this.email = data.email || "";
    this.username = data.username || "";
    this.displayName = data.displayName || data.username || "Usuario";
    this.bio = data.bio || "";
    this.avatarPath = data.avatarPath || null;
    this.avatarUrl = data.avatarUrl || null;
    this.createdAt = data.createdAt || null;
  }
}
