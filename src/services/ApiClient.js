import { APP_CONFIG } from "../config/appConfig.js";

export class ApiError extends Error {
  constructor(message, status, code = "API_ERROR") {
    super(message); this.name = "ApiError"; this.status = status; this.code = code;
  }
}

function connectionFailure(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("No hay conexión a Internet. Comprueba tu red y vuelve a intentarlo.", 0, "OFFLINE");
  }

  let origin = "no disponible";
  try { origin = globalThis.location?.origin || "no disponible"; } catch { /* entorno sin location */ }
  const localFile = origin === "null";
  const guidance = localFile
    ? "Nexo parece estar abierto como archivo local (file://). Inícialo con un servidor HTTP, por ejemplo: python -m http.server 5500."
    : `Origen del navegador: ${origin}.`;

  // TypeError from fetch may indicate CORS/preflight, DNS, TLS, a blocked request,
  // or a stale/incorrect endpoint. Avoid presenting it as an offline state.
  console.warn("Nexo API request could not reach the endpoint", {
    name: error?.name || "UnknownError",
    message: String(error?.message || "fetch failed").slice(0, 180),
    endpoint: APP_CONFIG.apiUrl,
    origin,
  });
  return new ApiError(
    `No se pudo recibir respuesta de Supabase. Comprueba tu conexión, que el endpoint ${APP_CONFIG.apiUrl} esté disponible y que el navegador no esté bloqueando la solicitud. ${guidance}`,
    0,
    "NETWORK_OR_CORS_ERROR",
  );
}

export class ApiClient {
  constructor(sessionStore) { this.sessionStore = sessionStore; this.refreshing = null; }

  getDeviceLabel() {
    try {
      const platform = navigator.userAgentData?.platform || navigator.platform || "Dispositivo";
      // Custom HTTP header values are kept ASCII-only to avoid UTF-8/Latin-1
      // conversion artifacts such as "Ã¯Â¿Â½" in stored device labels.
      const safePlatform = String(platform).normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/[<>]/g, "")
        .trim().slice(0, 40) || "Dispositivo";
      return `Nexo web - ${safePlatform}`;
    } catch { return "Nexo web"; }
  }

  async request(action, payload = {}, options = {}) {
    const { auth = true, retry = true } = options;
    const session = this.sessionStore.get();
    const headers = { "Content-Type": "application/json", apikey: APP_CONFIG.publishableKey, "x-device-label": this.getDeviceLabel() };
    if (auth && session?.token) headers.Authorization = `Bearer ${session.token}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), APP_CONFIG.requestTimeoutMs);
    let response;
    try {
      response = await fetch(APP_CONFIG.apiUrl, {
        method: "POST", headers, body: JSON.stringify({ action, ...payload }), signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new ApiError("La solicitud tardó demasiado. Inténtalo de nuevo.", 408, "TIMEOUT");
      throw connectionFailure(error);
    } finally { clearTimeout(timeout); }

    let result;
    try { result = await response.json(); }
    catch { throw new ApiError("El servidor devolvió una respuesta no válida.", response.status, "INVALID_RESPONSE"); }

    if (!response.ok || result?.ok === false) {
      const error = result?.error || {};
      if (auth && retry && response.status === 401 && action !== "auth.refresh" && session?.refreshToken) {
        const refreshed = await this.refreshSession(session.refreshToken);
        if (refreshed) return this.request(action, payload, { auth: true, retry: false });
      }
      throw new ApiError(error.message || "No se pudo completar la operación.", response.status, error.code || "API_ERROR");
    }
    return result.data;
  }


  async requestMultipart(formData, options = {}) {
    const action = formData.get("action");
    if (typeof action !== "string" || !action) throw new ApiError("Operación no válida.", 400, "INVALID_ACTION");
    const { auth = true, retry = true } = options;
    const session = this.sessionStore.get();
    const headers = { apikey: APP_CONFIG.publishableKey, "x-device-label": this.getDeviceLabel() };
    if (auth && session?.token) headers.Authorization = `Bearer ${session.token}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), APP_CONFIG.requestTimeoutMs);
    let response;
    try {
      response = await fetch(APP_CONFIG.apiUrl, { method: "POST", headers, body: formData, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw new ApiError("La solicitud tardó demasiado. Inténtalo de nuevo.", 408, "TIMEOUT");
      throw connectionFailure(error);
    } finally { clearTimeout(timeout); }

    let result;
    try { result = await response.json(); }
    catch { throw new ApiError("El servidor devolvió una respuesta no válida.", response.status, "INVALID_RESPONSE"); }
    if (!response.ok || result?.ok === false) {
      const error = result?.error || {};
      if (auth && retry && response.status === 401 && action !== "auth.refresh" && session?.refreshToken) {
        const refreshed = await this.refreshSession(session.refreshToken);
        if (refreshed) return this.requestMultipart(formData, { auth: true, retry: false });
      }
      throw new ApiError(error.message || "No se pudo completar la operación.", response.status, error.code || "API_ERROR");
    }
    return result.data;
  }

  async refreshSession(refreshToken) {
    if (!this.refreshing) {
      this.refreshing = this.request("auth.refresh", { refreshToken }, { auth: false, retry: false })
        .then((data) => { this.sessionStore.updateTokens(data); return true; })
        .catch(() => { this.sessionStore.clear(); return false; })
        .finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }
}
