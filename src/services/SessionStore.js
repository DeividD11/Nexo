import { APP_CONFIG } from "../config/appConfig.js";

export class SessionStore {
  get() {
    try {
      const value = sessionStorage.getItem(APP_CONFIG.sessionStorageKey);
      return value ? JSON.parse(value) : null;
    } catch { return null; }
  }
  set(session) {
    const safe = {
      token: session?.token || "", refreshToken: session?.refreshToken || "",
      expiresAt: session?.expiresAt || "", refreshExpiresAt: session?.refreshExpiresAt || "",
      sessionId: session?.sessionId || "", user: session?.user || null,
    };
    sessionStorage.setItem(APP_CONFIG.sessionStorageKey, JSON.stringify(safe));
  }
  updateTokens(session) {
    const current = this.get() || {};
    this.set({ ...current, ...session, user: session.user || current.user });
  }
  clear() { sessionStorage.removeItem(APP_CONFIG.sessionStorageKey); }
}
