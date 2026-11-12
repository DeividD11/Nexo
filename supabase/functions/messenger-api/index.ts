import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { AuthService } from "./auth/service.ts";
import { AccountService } from "./accounts/service.ts";
import { MessagingService } from "./messaging/service.ts";
import { GroupService } from "./groups/service.ts";
import { FileService } from "./files/service.ts";
import { NotificationService } from "./notifications/service.ts";
import { SettingsService } from "./settings/service.ts";
import { SearchService } from "./search/service.ts";
import { sha256Hex as sha256 } from "./auth/crypto.ts";

// La autenticación de la aplicación es propia. No se llama a admin.auth ni a Supabase Auth.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
const SERVICE_KEY = secrets.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}") as Record<string, string>;
const PUBLISHABLE_KEY = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Faltan variables Supabase internas.");
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const MAX_UPLOAD = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);
// Nexo no utiliza cookies ni credenciales automáticas del navegador: toda ruta privada
// exige un Bearer token opaco y lo valida en servidor. CORS público no sustituye esa autorización.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-requested-with, x-device-label",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message); this.status = status; this.code = code;
  }
}
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ ok: true, data }), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (message: string, status = 400, code = "BAD_REQUEST") => new Response(JSON.stringify({ ok: false, error: { message, code } }), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const nowIso = () => new Date().toISOString();
const str = (v: unknown, max = 2000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function cleanUser(user: any, profile: any = {}) {
  return { id: user.id, email: user.email, username: user.username, displayName: profile.display_name || user.username,
    bio: profile.bio || "", avatarPath: profile.avatar_path || null, showLastSeen: profile.show_last_seen ?? true,
    showOnlineStatus: profile.show_online_status ?? true, createdAt: user.created_at };
}
async function rateLimit(key: string, limit: number, seconds: number) {
  const { data, error } = await admin.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: seconds });
  if (error) { console.error("rate_limit_error", error.message); throw new ApiError("No fue posible validar la solicitud.", 503, "RATE_LIMIT_UNAVAILABLE"); }
  if (data !== true) throw new ApiError("Demasiadas solicitudes. Inténtalo nuevamente más tarde.", 429, "RATE_LIMITED");
}
async function ipKey(req: Request): Promise<string> {
  // Use only ingress-provided IP headers where available; hash the value before storing rate-limit keys.
  const raw = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
  const normalized = /^[0-9a-f:.]{2,64}$/i.test(raw) ? raw.toLowerCase() : "unknown";
  return await sha256(`ip:${normalized}`);
}
async function requireMember(conversationId: string, userId: string) {
  if (!isUuid(conversationId)) throw new ApiError("Conversación no válida.");
  const { data, error } = await admin.from("conversation_members").select("conversation_id,user_id,role,left_at,last_read_at")
    .eq("conversation_id", conversationId).eq("user_id", userId).is("left_at", null).maybeSingle();
  if (error || !data) throw new ApiError("No tienes acceso a esta conversación.", 403, "FORBIDDEN");
  return data;
}
async function isBlocked(a: string, b: string) {
  const { data } = await admin.from("blocked_users").select("blocker_id").or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`).limit(1);
  return !!data?.length;
}
async function userProfile(userId: string) {
  const [{ data: u }, { data: p }] = await Promise.all([
    admin.from("users").select("id,username,status").eq("id", userId).maybeSingle(),
    admin.from("user_profiles").select("display_name,avatar_path,show_last_seen,show_online_status").eq("user_id", userId).maybeSingle(),
  ]);
  if (!u) return null;
  let presence: any = null;
  if (p?.show_online_status !== false) {
    const { data } = await admin.from("user_presence").select("last_seen_at,typing_conversation_id,typing_until").eq("user_id", userId).maybeSingle();
    presence = data;
  }
  let avatarUrl: string | null = null;
  if (p?.avatar_path?.startsWith("avatars/" + userId + "/")) {
    const { data: signed } = await admin.storage.from("messenger-private").createSignedUrl(p.avatar_path, 3600);
    avatarUrl = signed?.signedUrl || null;
  }
  return { id: u.id, username: u.username, displayName: p?.display_name || u.username,
    avatarPath: avatarUrl, avatarUrl,
    online: p?.show_online_status !== false && !!presence && Date.now() - new Date(presence.last_seen_at).getTime() < 90_000,
    lastSeen: p?.show_online_status !== false && p?.show_last_seen !== false ? presence?.last_seen_at || null : null,
    typingConversationId: p?.show_online_status !== false && presence?.typing_until && new Date(presence.typing_until).getTime() > Date.now() ? presence.typing_conversation_id : null };
}
async function getConversationSummary(userId: string) {
  const { data: memberships, error } = await admin.from("conversation_members")
    .select("conversation_id,role,last_read_at")
    .eq("user_id", userId).is("left_at", null).limit(200);
  if (error) throw new ApiError("No se pudieron cargar las conversaciones.", 500, "QUERY_FAILED");
  const ids = (memberships || []).map((item: any) => item.conversation_id);
  if (!ids.length) return [];

  const [{ data: conversations, error: conversationError }, { data: allMembers, error: memberError }, { data: groupRows }] = await Promise.all([
    admin.from("conversations").select("id,kind,title,avatar_path,last_message_at,last_message_preview,created_at")
      .in("id", ids).order("last_message_at", { ascending: false, nullsFirst: false }),
    admin.from("conversation_members").select("conversation_id,user_id,role")
      .in("conversation_id", ids).is("left_at", null),
    admin.from("groups").select("conversation_id,description").in("conversation_id", ids),
  ]);
  if (conversationError || memberError) throw new ApiError("No se pudieron cargar las conversaciones.", 503, "QUERY_FAILED");

  const memberIds = [...new Set((allMembers || []).map((item: any) => item.user_id))];
  const [{ data: profiles }, { data: users }] = await Promise.all([
    memberIds.length ? admin.from("user_profiles").select("user_id,display_name,avatar_path").in("user_id", memberIds) : Promise.resolve({ data: [] } as any),
    memberIds.length ? admin.from("users").select("id,username").in("id", memberIds) : Promise.resolve({ data: [] } as any),
  ]);
  const profileMap = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));
  const userMap = new Map((users || []).map((item: any) => [item.id, item]));
  const groupMap = new Map((groupRows || []).map((item: any) => [item.conversation_id, item]));
  const memberMap = new Map<string, any[]>();

  for (const member of allMembers || []) {
    if (!memberMap.has(member.conversation_id)) memberMap.set(member.conversation_id, []);
    const profile: any = profileMap.get(member.user_id) || {};
    const account: any = userMap.get(member.user_id) || {};
    let avatarUrl: string | null = null;
    if (profile.avatar_path?.startsWith("avatars/" + member.user_id + "/")) {
      const { data: signed } = await admin.storage.from("messenger-private").createSignedUrl(profile.avatar_path, 3600);
      avatarUrl = signed?.signedUrl || null;
    }
    memberMap.get(member.conversation_id)!.push({
      id: member.user_id, username: account.username || "usuario",
      displayName: profile.display_name || account.username || "Usuario",
      avatarPath: avatarUrl, avatarUrl, role: member.role,
    });
  }

  const { data: unreadRows, error: unreadError } = await admin.from("message_receipts")
    .select("message_id").eq("user_id", userId).is("read_at", null).limit(1000);
  if (unreadError) throw new ApiError("No se pudieron cargar los mensajes pendientes.", 503, "UNREAD_LOOKUP_FAILED");
  const unreadIds = (unreadRows || []).map((item: any) => item.message_id);
  const unreadByConversation = new Map<string, number>();
  if (unreadIds.length) {
    const { data: unreadMessages, error: unreadMessagesError } = await admin.from("messages")
      .select("id,conversation_id").in("id", unreadIds).is("deleted_at", null).neq("sender_id", userId);
    if (unreadMessagesError) throw new ApiError("No se pudieron contar los mensajes pendientes.", 503, "UNREAD_LOOKUP_FAILED");
    for (const message of unreadMessages || []) {
      unreadByConversation.set(message.conversation_id, (unreadByConversation.get(message.conversation_id) || 0) + 1);
    }
  }

  const myRoleMap = new Map((memberships || []).map((item: any) => [item.conversation_id, item.role]));
  return await Promise.all((conversations || []).map(async (conversation: any) => {
    const members = memberMap.get(conversation.id) || [];
    const peer = conversation.kind === "private" ? members.find((member: any) => member.id !== userId) : null;
    const group: any = groupMap.get(conversation.id) || {};
    let groupAvatarUrl: string | null = null;
    if (conversation.kind === "group" && conversation.avatar_path?.startsWith("groups/" + conversation.id + "/")) {
      const { data: signed } = await admin.storage.from("messenger-private").createSignedUrl(conversation.avatar_path, 3600);
      groupAvatarUrl = signed?.signedUrl || null;
    }
    return {
      ...conversation,
      displayTitle: conversation.kind === "private" ? (peer?.displayName || "Conversación") : (conversation.title || "Grupo"),
      displayAvatar: conversation.kind === "private" ? (peer?.avatarUrl || null) : groupAvatarUrl,
      avatarUrl: conversation.kind === "private" ? (peer?.avatarUrl || null) : groupAvatarUrl,
      description: group.description || "",
      members,
      myRole: myRoleMap.get(conversation.id) || "member",
      unreadCount: unreadByConversation.get(conversation.id) || 0,
    };
  }));
}

const authService = new AuthService(admin, { ApiError, rateLimit, cleanUser, str, nowIso });
const accountService = new AccountService(admin, { ApiError, rateLimit, str, nowIso, isUuid, validateFileSignature });
const messagingService = new MessagingService(admin, { ApiError, rateLimit, str, nowIso, isUuid, requireMember, userProfile });
const groupService = new GroupService(admin, { ApiError, rateLimit, str, isUuid, requireMember, userProfile, validateFileSignature });
const fileService = new FileService(admin, { ApiError, rateLimit, str, isUuid, requireMember, validateFileSignature, nowIso });
const notificationService = new NotificationService(admin, { ApiError, rateLimit, str, isUuid, nowIso });
const settingsService = new SettingsService(admin, { ApiError, rateLimit });
const searchService = new SearchService(admin, { ApiError, rateLimit, str, getConversationSummary, userProfile });

async function validateFileSignature(file: File, mime: string) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (mime === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mime === "image/gif") return starts(0x47, 0x49, 0x46, 0x38);
  if (mime === "image/webp") return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "application/pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (mime === "application/zip" || mime.includes("officedocument")) return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06);
  if (mime.startsWith("text/")) {
    const sample = new Uint8Array(await file.slice(0, Math.min(file.size, 4096)).arrayBuffer());
    return !sample.includes(0);
  }
  // MS Office legacy formats have OLE compound-file signature.
  if (["application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"].includes(mime))
    return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  return false;
}

async function handle(req: Request) {
  // Responder al preflight antes de parsear cuerpo, validar apikey o buscar sesión.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") throw new ApiError("Método no permitido.", 405, "METHOD_NOT_ALLOWED");
  if (!PUBLISHABLE_KEY) throw new ApiError("El backend no tiene configurada la clave publicable.", 503, "CONFIGURATION_ERROR");
  if (req.headers.get("apikey") !== PUBLISHABLE_KEY) throw new ApiError("Cliente no autorizado.", 401, "INVALID_CLIENT");
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD + 256 * 1024) throw new ApiError("La solicitud supera el tamaño permitido.", 413, "REQUEST_TOO_LARGE");
  const contentType = req.headers.get("content-type") || "";
  let input: any = {};
  if (contentType.includes("multipart/form-data")) input = await req.formData();
  else {
    try { input = await req.json(); } catch { throw new ApiError("El cuerpo de la solicitud no es JSON válido."); }
  }
  const action = str(contentType.includes("multipart/form-data") ? input.get("action") : input.action, 80);
  const ip = await ipKey(req);

  // Authentication endpoints are delegated to the AuthService; user identity is never accepted from the body.
  if (action === "auth.register") return ok(await authService.register(input, req, ip), 201);
  if (action === "auth.login") return ok(await authService.login(input, req, ip));
  if (action === "auth.refresh") return ok(await authService.refresh(input, ip));
  if (action === "auth.recover") return ok(await authService.recover(input, ip));
  if (action === "auth.reset") return ok(await authService.reset(input, ip));

  const user = await authService.getSession(req);
  switch (action) {
    case "auth.session": return ok(authService.sessionInfo(user));
    case "auth.logout": return ok(await authService.logout(user));
    case "auth.sessions": return ok(await authService.listSessions(user));
    case "auth.revoke-session": return ok(await authService.revokeSession(user, input.sessionId));
    case "auth.revoke-other-sessions":
    case "devices.revoke-others": return ok(await authService.revokeOtherSessions(user));
    case "devices.list": return ok(await authService.listSessions(user));
    case "devices.revoke": return ok(await authService.revokeSession(user, input.sessionId));
    case "profile.get": return ok(await accountService.getProfile(user));
    case "profile.update": return ok(await accountService.updateProfile(user, input));
    case "profile.avatar.upload": return ok(await accountService.uploadAvatar(user, input.get("file")), 201);
    case "profile.avatar.delete": return ok(await accountService.deleteAvatar(user));
    case "settings.get": return ok(await settingsService.get(user));
    case "settings.update": return ok(await settingsService.update(user, input));
    case "users.search": return ok(await accountService.searchUsers(user, input));
    case "contacts.list": return ok(await accountService.listContacts(user));
    case "contacts.request": return ok(await accountService.requestContact(user, input), 201);
    case "contacts.respond": return ok(await accountService.respondContact(user, input));
    case "contacts.cancel": return ok(await accountService.cancelContact(user, input));
    case "contacts.remove": return ok(await accountService.removeContact(user, input));
    case "users.block": return ok(await accountService.setBlocked(user, input));
    case "users.blocks.list": return ok(await accountService.listBlockedUsers(user));
    case "conversations.create": {
      await rateLimit(`conversation-create:${user.id}`, 30, 3600);
      const peerId = str(input.userId, 40);
      if (!isUuid(peerId) || peerId === user.id) throw new ApiError("Contacto no válido.", 400, "INVALID_CONTACT");
      const [firstId, secondId] = [user.id, peerId].sort();
      const [{ data: peer, error: peerError }, { data: contact, error: contactError }] = await Promise.all([
        admin.from("users").select("id").eq("id", peerId).eq("status", "active").maybeSingle(),
        admin.from("contacts").select("user_a,user_b").eq("user_a", firstId).eq("user_b", secondId).maybeSingle(),
      ]);
      if (peerError || contactError) throw new ApiError("No se pudo validar el contacto.", 503, "CONTACT_LOOKUP_FAILED");
      if (!peer || !contact) throw new ApiError("Solo puedes conversar con contactos aceptados.", 403, "CONTACT_REQUIRED");
      if (await isBlocked(user.id, peerId)) throw new ApiError("No se puede abrir esta conversación por una restricción de bloqueo.", 403, "CONTACT_BLOCKED");

      const privatePairKey = `${firstId}:${secondId}`;
      // private_pair_key is protected by a PARTIAL unique index. PostgREST upsert
      // with onConflict=private_pair_key cannot infer that index, so first look
      // up the row and then INSERT; a concurrent duplicate is recovered by 23505.
      let conversation: { id: string } | null = null;
      let created = false;
      const { data: existing, error: existingError } = await admin.from("conversations")
        .select("id").eq("private_pair_key", privatePairKey).maybeSingle();
      if (existingError) throw new ApiError("No se pudo consultar la conversación existente.", 503, "CONVERSATION_LOOKUP_FAILED");
      conversation = existing;

      if (!conversation) {
        const { data: inserted, error: insertError } = await admin.from("conversations")
          .insert({ kind: "private", private_pair_key: privatePairKey, created_by: user.id })
          .select("id").single();
        if (insertError) {
          if (insertError.code === "23505") {
            const { data: raced, error: racedError } = await admin.from("conversations")
              .select("id").eq("private_pair_key", privatePairKey).maybeSingle();
            if (racedError || !raced) {
              console.error("private_conversation_race_recovery_failed", racedError?.code || "not_found");
              throw new ApiError("No se pudo recuperar la conversación creada en paralelo.", 503, "CONVERSATION_RACE_FAILED");
            }
            conversation = raced;
          } else {
            console.error("private_conversation_insert_failed", insertError.code || "unknown");
            throw new ApiError("No se pudo crear la conversación.", 503, "CONVERSATION_CREATE_FAILED");
          }
        } else {
          conversation = inserted;
          created = true;
        }
      }

      const { error: membersError } = await admin.from("conversation_members").upsert([
        { conversation_id: conversation.id, user_id: firstId, role: "member", left_at: null },
        { conversation_id: conversation.id, user_id: secondId, role: "member", left_at: null },
      ], { onConflict: "conversation_id,user_id" });
      if (membersError) {
        console.error("private_conversation_members_failed", membersError.code || "unknown");
        throw new ApiError("No se pudieron preparar los participantes.", 503, "CONVERSATION_MEMBERS_FAILED");
      }
      return ok({ conversationId: conversation.id, created }, created ? 201 : 200);
    }
    case "conversations.list": return ok(await getConversationSummary(user.id));
    case "conversations.search": return ok(await searchService.conversations(user, input));
    case "groups.create": return ok(await groupService.create(user, input), 201);
    case "groups.update": return ok(await groupService.update(user, input));
    case "groups.members": return ok(await groupService.members(user, input));
    case "groups.add-member": return ok(await groupService.addMember(user, input));
    case "groups.remove-member": return ok(await groupService.removeMember(user, input));
    case "groups.set-role": return ok(await groupService.setRole(user, input));
    case "groups.avatar.upload": return ok(await groupService.uploadAvatar(user, input.get("file"), input), 201);
    case "groups.avatar.delete": return ok(await groupService.deleteAvatar(user, input));
    case "messages.list": return ok(await messagingService.list(user, input));
    case "messages.send": return ok(await messagingService.send(user, input), 201);
    case "messages.edit": return ok(await messagingService.edit(user, input));
    case "messages.delete": return ok(await messagingService.delete(user, input));
    case "messages.read": return ok(await messagingService.read(user, input));
    case "messages.react": return ok(await messagingService.react(user, input));
    case "messages.report": {
      const id = str(input.messageId, 40); const reason = str(input.reason, 80); const details = str(input.details, 500);
      if (!isUuid(id) || !reason) throw new ApiError("Reporte no válido.");
      const { data: msg } = await admin.from("messages").select("conversation_id").eq("id", id).maybeSingle();
      if (!msg) throw new ApiError("Mensaje no encontrado.", 404);
      await requireMember(msg.conversation_id, user.id);
      const { error } = await admin.from("message_reports").insert({ reporter_id: user.id, message_id: id, reason, details });
      if (error) throw new ApiError("Ya reportaste este mensaje o no fue posible registrar el reporte.", 409);
      return ok({ reported: true });
    }
    case "files.upload": return ok(await fileService.upload(user, input), 201);
    case "files.url": return ok(await fileService.signedUrl(user, input));
    case "files.delete": return ok(await fileService.delete(user, input));
    case "notifications.list": return ok(await notificationService.list(user));
    case "notifications.read": return ok(await notificationService.markRead(user, input));
    case "notifications.read-all": return ok(await notificationService.markRead(user, input, true));
    case "search.messages": return ok(await searchService.messages(user, input));
    case "presence.ping": {
      await rateLimit(`presence:${user.id}`, 240, 300);
      const conversationId = input.conversationId ? str(input.conversationId, 40) : null;
      const typing = input.typing === true;
      if (typing && !conversationId) throw new ApiError("Selecciona una conversación para indicar escritura.");
      if (conversationId) await requireMember(conversationId, user.id);
      const timestamp = nowIso();
      const { error } = await admin.from("user_presence").upsert({
        user_id: user.id, last_seen_at: timestamp,
        typing_conversation_id: typing ? conversationId : null,
        typing_until: typing ? new Date(Date.now() + 8_000).toISOString() : null,
        updated_at: timestamp,
      }, { onConflict: "user_id" });
      if (error) throw new ApiError("No se pudo actualizar la presencia.", 503, "PRESENCE_UPDATE_FAILED");
      return ok({ alive: true, serverTime: timestamp });
    }
    case "presence.conversation": {
      await rateLimit(`presence-read:${user.id}`, 120, 300);
      const conversationId = str(input.conversationId, 40);
      await requireMember(conversationId, user.id);
      const { data: members, error: memberError } = await admin.from("conversation_members")
        .select("user_id").eq("conversation_id", conversationId).is("left_at", null).neq("user_id", user.id);
      if (memberError) throw new ApiError("No se pudo consultar la presencia.", 503, "PRESENCE_LOOKUP_FAILED");
      const ids = (members || []).map((item: any) => item.user_id);
      if (!ids.length) return ok([]);
      const [{ data: presenceRows, error: presenceError }, { data: profileRows, error: profileError }, { data: userRows, error: userError }] = await Promise.all([
        admin.from("user_presence").select("user_id,last_seen_at,typing_conversation_id,typing_until").in("user_id", ids),
        admin.from("user_profiles").select("user_id,show_last_seen,show_online_status").in("user_id", ids),
        admin.from("users").select("id,username").in("id", ids).eq("status", "active"),
      ]);
      if (presenceError || profileError || userError) throw new ApiError("No se pudo consultar la presencia.", 503, "PRESENCE_LOOKUP_FAILED");
      const presenceMap = new Map((presenceRows || []).map((item: any) => [item.user_id, item]));
      const profileMap = new Map((profileRows || []).map((item: any) => [item.user_id, item]));
      const userMap = new Map((userRows || []).map((item: any) => [item.id, item]));
      const now = Date.now();
      return ok(ids.filter((id: string) => userMap.has(id)).map((id: string) => {
        const presence: any = presenceMap.get(id) || null;
        const profile: any = profileMap.get(id) || {};
        const onlineVisible = profile.show_online_status !== false;
        const seenAt = presence?.last_seen_at || null;
        const isOnline = onlineVisible && !!seenAt && now - new Date(seenAt).getTime() < 90_000;
        const typing = onlineVisible && presence?.typing_conversation_id === conversationId &&
          !!presence?.typing_until && new Date(presence.typing_until).getTime() > now;
        return {
          userId: id, username: userMap.get(id).username, online: isOnline,
          lastSeen: onlineVisible && profile.show_last_seen !== false ? seenAt : null, typing,
        };
      }));
    }
    default: throw new ApiError("Acción no reconocida.", 404, "UNKNOWN_ACTION");
  }
}

function withCors(response: Response, _req: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", CORS["Access-Control-Allow-Headers"]);
  headers.set("Access-Control-Allow-Methods", CORS["Access-Control-Allow-Methods"]);
  headers.set("Access-Control-Max-Age", CORS["Access-Control-Max-Age"]);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

Deno.serve(async (req: Request) => {
  try {
    return withCors(await handle(req), req);
  } catch (error) {
    if (error instanceof ApiError) return withCors(fail(error.message, error.status, error.code), req);
    console.error("messenger_api_error", error instanceof Error ? error.message : "unknown");
    return withCors(fail("Ocurrió un error interno. Inténtalo nuevamente.", 500, "INTERNAL_ERROR"), req);
  }
});
