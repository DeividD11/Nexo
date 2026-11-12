import {
  base64url,
  hashPassword,
  randomBytes,
  sha256Hex,
  verifyPassword,
} from "./crypto.ts";
import { AuthRepository } from "./repository.ts";

const ACCESS_TOKEN_HOURS = 12;
const REFRESH_TOKEN_DAYS = 30;
const RESET_TOKEN_MINUTES = 30;
const DUMMY_PASSWORD_HASH =
  "pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

type AuthDependencies = {
  ApiError: new (message: string, status?: number, code?: string) => Error;
  rateLimit: (key: string, limit: number, seconds: number) => Promise<void>;
  cleanUser: (user: any, profile?: any) => any;
  str: (value: unknown, max?: number) => string;
  nowIso: () => string;
};

export class AuthService {
  private repository: AuthRepository;
  private deps: AuthDependencies;

  constructor(database: any, dependencies: AuthDependencies) {
    this.repository = new AuthRepository(database);
    this.deps = dependencies;
  }

  private error(message: string, status = 400, code = "BAD_REQUEST"): never {
    throw new this.deps.ApiError(message, status, code);
  }

  private validatePassword(password: string): void {
    const characters = [...password].length;
    const bytes = new TextEncoder().encode(password).length;
    if (characters < 10 || characters > 128 || bytes > 512) {
      this.error("La contraseña debe tener entre 10 y 128 caracteres y no superar 512 bytes.");
    }
  }

  private async tokenPair() {
    const accessToken = base64url(randomBytes(32));
    const refreshToken = base64url(randomBytes(32));
    const [accessHash, refreshHash] = await Promise.all([
      sha256Hex(accessToken),
      sha256Hex(refreshToken),
    ]);
    return { accessToken, refreshToken, accessHash, refreshHash };
  }

  async issueSession(user: any, req: Request) {
    const { accessToken, refreshToken, accessHash, refreshHash } = await this.tokenPair();
    const now = Date.now();
    const expiresAt = new Date(now + ACCESS_TOKEN_HOURS * 60 * 60_000).toISOString();
    const refreshExpiresAt = new Date(now + REFRESH_TOKEN_DAYS * 24 * 60 * 60_000).toISOString();
    const device = this.deps.str(req.headers.get("x-device-label") || "Navegador", 80);
    const userAgent = this.deps.str(req.headers.get("user-agent") || "", 300);

    const { data: session, error } = await this.repository.createSession({
      user_id: user.id,
      token_hash: accessHash,
      refresh_token_hash: refreshHash,
      refresh_expires_at: refreshExpiresAt,
      device_label: device,
      user_agent: userAgent,
      expires_at: expiresAt,
    });

    if (error || !session) {
      console.error("session_create_failed", error?.code || "unknown");
      this.error("No se pudo crear la sesión.", 500, "SESSION_CREATE_FAILED");
    }

    const { error: deviceError } = await this.repository.recordDevice(user.id, device);
    if (deviceError) console.warn("device_record_failed", deviceError.code);

    const { data: profile } = await this.repository.findProfile(user.id);
    return {
      token: accessToken,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
      sessionId: session.id,
      user: this.deps.cleanUser(user, profile || {}),
    };
  }

  async getSession(req: Request) {
    const authorization = req.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{43})$/i);
    if (!match) this.error("Tu sesión no es válida. Inicia sesión nuevamente.", 401, "UNAUTHENTICATED");

    const tokenHash = await sha256Hex(match[1]);
    const { data: session, error } = await this.repository.findSessionByAccessHash(tokenHash, this.deps.nowIso());
    if (error || !session) {
      this.error("Tu sesión expiró o fue revocada. Inicia sesión nuevamente.", 401, "SESSION_EXPIRED");
    }

    const { data: user, error: userError } = await this.repository.findUserById(session.user_id);
    if (userError || !user || user.status !== "active") {
      this.error("La cuenta no está disponible.", 401, "ACCOUNT_UNAVAILABLE");
    }

    const { data: profile } = await this.repository.findProfile(user.id);
    const lastSeen = new Date(session.last_seen_at || 0).getTime();
    if (Date.now() - lastSeen > 5 * 60_000) {
      const { error: touchError } = await this.repository.touchSession(session.id, user.id, this.deps.nowIso());
      if (touchError) console.warn("session_touch_failed", touchError.code);
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      status: user.status,
      created_at: user.created_at,
      profile: profile || {},
      sessionId: session.id,
      tokenHash,
    };
  }

  async register(input: any, req: Request, ipKey: string) {
    const email = this.deps.str(input.email, 254).toLowerCase();
    const username = this.deps.str(input.username, 32).toLowerCase();
    const displayName = this.deps.str(input.displayName, 80);
    const password = typeof input.password === "string" ? input.password : "";

    await this.deps.rateLimit(`register-ip:${ipKey}`, 5, 3600);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^[a-z0-9_.]{3,24}$/.test(username) ||
        displayName.length < 2) {
      this.error("Revisa el correo, el nombre de usuario (3–24 caracteres) y el nombre visible.");
    }
    this.validatePassword(password);
    await this.deps.rateLimit(`register-email:${await sha256Hex(email)}`, 3, 86400);

    const passwordHash = await hashPassword(password);
    const { data: user, error } = await this.repository.createUser(email, username, passwordHash);

    if (error || !user) {
      if (error?.code !== "23505") console.error("registration_insert_failed", error?.code || "unknown");
      this.error(
        "No fue posible crear la cuenta con esos datos. Comprueba que el correo y el usuario estén disponibles.",
        409,
        "REGISTRATION_FAILED",
      );
    }

    const [profile, settings, presence] = await this.repository.createUserRelations(user.id, displayName);
    if (profile.error || settings.error || presence.error) {
      const { error: rollbackError } = await this.repository.deleteUser(user.id);
      if (rollbackError) console.error("registration_rollback_failed", rollbackError.code);
      this.error("No se pudo completar el registro. Inténtalo nuevamente.", 500, "PROFILE_CREATE_FAILED");
    }

    return await this.issueSession(user, req);
  }

  async login(input: any, req: Request, ipKey: string) {
    const identifier = this.deps.str(input.identifier, 254).toLowerCase();
    const password = typeof input.password === "string" ? input.password : "";

    await this.deps.rateLimit(`login-ip:${ipKey}`, 20, 900);
    if (!identifier || identifier.length > 254 || !password || [...password].length > 128 ||
        new TextEncoder().encode(password).length > 512) {
      this.error("Credenciales incorrectas.", 401, "INVALID_CREDENTIALS");
    }
    await this.deps.rateLimit(`login-id:${await sha256Hex(identifier)}`, 12, 900);

    let { data: user, error: lookupError } = await this.repository.findLoginUserByEmail(identifier);
    if (!user && !lookupError) {
      const result = await this.repository.findLoginUserByUsername(identifier);
      user = result.data;
      lookupError = result.error;
    }
    if (lookupError) {
      console.error("login_lookup_failed", lookupError.code);
      this.error("No fue posible validar las credenciales.", 503, "AUTH_UNAVAILABLE");
    }

    const passwordMatches = await verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!user || user.status !== "active" || !passwordMatches) {
      this.error("Credenciales incorrectas.", 401, "INVALID_CREDENTIALS");
    }

    delete user.password_hash;
    return await this.issueSession(user, req);
  }

  async refresh(input: any, ipKey: string) {
    await this.deps.rateLimit(`refresh-ip:${ipKey}`, 60, 900);
    const refreshToken = this.deps.str(input.refreshToken, 128);
    if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) {
      this.error("El token de renovación no es válido.", 401, "REFRESH_INVALID");
    }

    const oldRefreshHash = await sha256Hex(refreshToken);
    const now = this.deps.nowIso();
    const { data: session, error } = await this.repository.findSessionByRefreshHash(oldRefreshHash, now);
    if (error || !session) {
      this.error("La sesión expiró o fue revocada. Inicia sesión nuevamente.", 401, "REFRESH_INVALID");
    }

    const { data: user, error: userError } = await this.repository.findUserById(session.user_id);
    if (userError || !user || user.status !== "active") {
      this.error("La cuenta no está disponible.", 401, "ACCOUNT_UNAVAILABLE");
    }

    const { accessToken, refreshToken: nextRefreshToken, accessHash, refreshHash } = await this.tokenPair();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_HOURS * 60 * 60_000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60_000).toISOString();

    const { data: rotated, error: rotateError } = await this.repository.rotateSession(
      session.id,
      oldRefreshHash,
      {
        token_hash: accessHash,
        refresh_token_hash: refreshHash,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
        last_seen_at: now,
      },
      now,
    );

    if (rotateError || !rotated) {
      this.error("La sesión ya fue renovada o dejó de ser válida. Inicia sesión nuevamente.", 401, "REFRESH_REPLAYED");
    }

    const { data: profile } = await this.repository.findProfile(user.id);
    return {
      token: accessToken,
      refreshToken: nextRefreshToken,
      expiresAt,
      refreshExpiresAt,
      sessionId: session.id,
      user: this.deps.cleanUser(user, profile || {}),
    };
  }

  async recover(input: any, ipKey: string) {
    await this.deps.rateLimit(`recover-ip:${ipKey}`, 5, 3600);
    const email = this.deps.str(input.email, 254).toLowerCase();

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await this.deps.rateLimit(`recover-email:${await sha256Hex(email)}`, 3, 3600);
      const { data: user, error } = await this.repository.findRecoveryUser(email);

      if (error) {
        console.error("recovery_lookup_failed", error.code);
      } else if (user && user.status === "active") {
        const now = this.deps.nowIso();
        const { error: invalidateError } = await this.repository.invalidateOpenResetTokens(user.id, now);
        if (invalidateError) console.error("recovery_old_token_invalidate_failed", invalidateError.code);

        const resetToken = base64url(randomBytes(32));
        const resetHash = await sha256Hex(resetToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000).toISOString();
        const { error: insertError } = await this.repository.createPasswordResetToken(user.id, resetHash, expiresAt);

        if (insertError) {
          console.error("recovery_token_create_failed", insertError.code);
        } else {
          const mailKey = Deno.env.get("RESEND_API_KEY");
          const mailFrom = Deno.env.get("MAIL_FROM");
          const appBase = Deno.env.get("APP_BASE_URL");

          if (mailKey && mailFrom && appBase) {
            const link = `${appBase.replace(/\/+$/, "")}/reset-password.html?token=${encodeURIComponent(resetToken)}`;
            try {
              const mail = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${mailKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: mailFrom,
                  to: [user.email],
                  subject: "Restablecer contraseña de Messenger Web",
                  html: `<p>Solicitaste cambiar tu contraseña.</p><p><a href="${link}">Crear una contraseña nueva</a></p><p>El enlace caduca en 30 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>`,
                }),
                signal: AbortSignal.timeout(8_000),
              });

              if (!mail.ok) {
                console.error("recovery_email_failed", mail.status);
                await this.repository.invalidatePasswordResetToken(resetHash, this.deps.nowIso());
              }
            } catch (mailError) {
              console.error("recovery_email_request_failed", mailError instanceof Error ? mailError.name : "unknown");
              await this.repository.invalidatePasswordResetToken(resetHash, this.deps.nowIso());
            }
          } else {
            console.error("recovery_email_not_configured");
            await this.repository.invalidatePasswordResetToken(resetHash, this.deps.nowIso());
          }
        }
      }
    }

    return { message: "Si la cuenta existe, recibirás instrucciones para restablecer la contraseña." };
  }

  async reset(input: any, ipKey: string) {
    await this.deps.rateLimit(`reset-ip:${ipKey}`, 8, 900);
    const resetToken = this.deps.str(input.token, 128);
    const password = typeof input.password === "string" ? input.password : "";
    this.validatePassword(password);

    if (!/^[A-Za-z0-9_-]{43}$/.test(resetToken)) {
      this.error("El enlace expiró o ya fue utilizado.", 400, "RESET_INVALID");
    }

    const tokenHash = await sha256Hex(resetToken);
    const passwordHash = await hashPassword(password);
    const { data, error } = await this.repository.consumePasswordReset(tokenHash, passwordHash);

    if (error) {
      console.error("password_reset_failed", error.code);
      this.error("No se pudo completar el restablecimiento. Inténtalo nuevamente.", 503, "RESET_UNAVAILABLE");
    }
    if (data !== true) {
      this.error("El enlace expiró o ya fue utilizado.", 400, "RESET_INVALID");
    }

    return { message: "Contraseña actualizada. Inicia sesión con la nueva contraseña." };
  }

  sessionInfo(user: any) {
    return {
      user: this.deps.cleanUser(user, user.profile),
      sessionExpiresInHours: ACCESS_TOKEN_HOURS,
      refreshExpiresInDays: REFRESH_TOKEN_DAYS,
    };
  }

  async logout(user: any) {
    const { error } = await this.repository.closeSession(user.sessionId, user.id, this.deps.nowIso());
    if (error) this.error("No se pudo cerrar la sesión.", 500, "LOGOUT_FAILED");
    return { message: "Sesión cerrada." };
  }

  async listSessions(user: any) {
    const { data, error } = await this.repository.listSessions(user.id);
    if (error) this.error("No se pudieron consultar las sesiones.", 500, "SESSION_LIST_FAILED");
    return (data || []).filter((session: any) => new Date(session.expires_at).getTime() > Date.now() || (session.refresh_expires_at && new Date(session.refresh_expires_at).getTime() > Date.now())).map((session: any) => ({
      ...session,
      current: session.id === user.sessionId,
      deviceLabel: session.device_label || "Dispositivo",
      userAgent: session.user_agent || "",
    }));
  }

  async revokeOtherSessions(user: any) {
    const { data, error } = await this.repository.revokeOtherSessions(user.sessionId, user.id, this.deps.nowIso());
    if (error) this.error("No se pudieron cerrar las otras sesiones.", 503, "SESSIONS_REVOKE_FAILED");
    return { revoked: (data || []).length };
  }

  async revokeSession(user: any, requestedSessionId: unknown) {
    const sessionId = this.deps.str(requestedSessionId, 40);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      this.error("Sesión no válida.");
    }

    const { data, error } = await this.repository.revokeSession(sessionId, user.id, this.deps.nowIso());
    if (error) this.error("No se pudo revocar la sesión.", 500, "SESSION_REVOKE_FAILED");
    if (!data) this.error("La sesión no existe o ya fue revocada.", 404, "SESSION_NOT_FOUND");
    return { message: "Sesión revocada." };
  }
}
