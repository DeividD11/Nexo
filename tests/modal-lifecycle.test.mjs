import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getModalInstanceKey, getModalRenderSignature, renderModal } from "../src/views/components/Modal.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("a modal keeps its identity when switching modes, but message-specific dialogs get separate identities", () => {
  assert.equal(
    getModalInstanceKey({ type: "auth", mode: "login" }),
    getModalInstanceKey({ type: "auth", mode: "register" }),
  );
  assert.notEqual(
    getModalInstanceKey({ type: "edit-message", messageId: "message-a" }),
    getModalInstanceKey({ type: "edit-message", messageId: "message-b" }),
  );
  assert.notEqual(
    getModalInstanceKey({ type: "file-preview", fileUrl: "https://files.test/a.png" }),
    getModalInstanceKey({ type: "file-preview", fileUrl: "https://files.test/b.png" }),
  );
});

test("unrelated background synchronization does not change the modal body signature", () => {
  const modal = { type: "group-manager", title: "Administrar grupo" };
  const base = {
    groupLoading: false,
    user: { id: "user-1" },
    contacts: [{ id: "contact-1", displayName: "Alex", username: "alex", avatarUrl: null }],
    activeConversation: {
      id: "group-1", title: "Amigos", avatarUrl: null, avatarPath: null,
      description: "Grupo", myRole: "owner", members: [{ id: "user-1", role: "owner" }],
      lastMessageAt: "2026-11-12T00:00:00Z",
    },
    networkStatus: "online",
    presence: [],
  };
  const afterSync = {
    ...base,
    networkStatus: "reconnecting",
    presence: [{ user_id: "user-2", online: true }],
    activeConversation: { ...base.activeConversation, lastMessageAt: "2026-11-12T00:00:05Z" },
  };
  assert.equal(getModalRenderSignature(modal, base), getModalRenderSignature(modal, afterSync));
});

test("settings modal signature changes when the displayed session list changes", () => {
  const modal = { type: "settings", title: "Preferencias y dispositivos" };
  const before = { settings: {}, deviceSessions: [], sessionsLoading: true, themePreference: "system" };
  const after = { ...before, deviceSessions: [{ id: "session-1", current: true }], sessionsLoading: false };
  assert.notEqual(getModalRenderSignature(modal, before), getModalRenderSignature(modal, after));
});

test("modal feedback remains outside the independently refreshed modal body", () => {
  const html = renderModal({ type: "auth", mode: "login", title: "Iniciar sesión" });
  assert.match(html, /class="modal-body"/);
  assert.match(html, /id="modal-error"/);
  assert.ok(html.indexOf('class="modal-body"') < html.indexOf('id="modal-error"'));
});

test("AppView reuses the mounted modal node instead of rebuilding the app root", async () => {
  const source = await read("src/views/AppView.js");
  assert.match(source, /currentModal\.\_\_nexoModalKey === nextModalKey/);
  assert.match(source, /this\.updateModalNode\(currentModal, nextModal/);
  assert.match(source, /currentShell\.insertBefore\(child, canReuseModal \? currentModal : null\)/);
  assert.match(source, /typeof document\.createElement !== "function"/);
  assert.match(source, /this\.root\.replaceChildren\(nextShell\)/);
});

test("feedback components use opaque surfaces and sit above modal dimming layers", async () => {
  const css = await read("src/styles/components.css");
  assert.match(css, /\.toast-region\s*\{[^}]*z-index:\s*140/s);
  assert.match(css, /\.global-error\s*\{[^}]*background-color:\s*var\(--danger-soft\)/s);
  assert.match(css, /\.app-shell\.has-modal\s*>\s*\.global-error\s*\{\s*z-index:\s*35/s);
  assert.match(css, /\.toast--info\s*\{\s*background-color:/);
  assert.match(css, /\.toast--error\s*\{\s*background-color:/);
});
