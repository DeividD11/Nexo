export class AuthRepository {
  constructor(apiClient, sessionStore) { this.api = apiClient; this.sessionStore = sessionStore; }
  async login(identifier, password) {
    const data = await this.api.request("auth.login", { identifier, password }, { auth: false });
    this.sessionStore.set(data); return data.user;
  }
  async register(form) {
    const data = await this.api.request("auth.register", form, { auth: false });
    this.sessionStore.set(data); return data.user;
  }
  async restore() {
    const stored = this.sessionStore.get();
    if (!stored?.token) return null;
    try {
      const data = await this.api.request("auth.session");
      this.sessionStore.updateTokens({ ...stored, user: data.user }); return data.user;
    } catch { this.sessionStore.clear(); return null; }
  }
  recover(email) { return this.api.request("auth.recover", { email }, { auth: false }); }
  resetPassword(token, password) { return this.api.request("auth.reset", { token, password }, { auth: false }); }
  sessions() { return this.api.request("devices.list"); }
  revokeSession(sessionId) { return this.api.request("devices.revoke", { sessionId }); }
  revokeOtherSessions() { return this.api.request("devices.revoke-others"); }
  async logout() { try { await this.api.request("auth.logout"); } finally { this.sessionStore.clear(); } }
}
