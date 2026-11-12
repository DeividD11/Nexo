import test from 'node:test';
import assert from 'node:assert/strict';
import { FileRepository } from '../src/models/repositories/FileRepository.js';
import { NotificationRepository } from '../src/models/repositories/NotificationRepository.js';
import { SettingsRepository } from '../src/models/repositories/SettingsRepository.js';
import { SearchRepository } from '../src/models/repositories/SearchRepository.js';
import { AttachmentController } from '../src/controllers/AttachmentController.js';
import { SettingsController } from '../src/controllers/SettingsController.js';
import { NotificationController } from '../src/controllers/NotificationController.js';
import { renderModal } from '../src/views/components/Modal.js';
import { AppView } from '../src/views/AppView.js';
import { Message } from '../src/models/entities/Message.js';
import { Conversation } from '../src/models/entities/Conversation.js';

function makeApi() {
  const calls = [];
  return {
    calls,
    request: async (action, payload) => { calls.push({ action, payload }); return action === 'notifications.list' ? { items: [], unreadCount: 0 } : {}; },
    requestMultipart: async (form) => { calls.push({ action: form.get('action'), conversationId: form.get('conversationId'), file: form.get('file') }); return { id: 'attachment-1' }; },
  };
}

function makeDocument() {
  return {
    hidden: false,
    activeElement: null,
    documentElement: { dataset: {} },
    body: { classList: { toggle() {} } },
    addEventListener() {},
    removeEventListener() {},
  };
}

test('file repository uses multipart uploads and server-authorized URL/delete actions', async () => {
  const api = makeApi();
  const repository = new FileRepository(api);
  const uploadBlob = new Blob(['image-data'], { type: 'image/png' });
  Object.defineProperty(uploadBlob, 'name', { value: 'photo.png' });
  await repository.upload('conversation-1', uploadBlob);
  await repository.url('attachment-1', 'preview');
  await repository.delete('attachment-1');
  assert.deepEqual(api.calls.map((call) => call.action), ['files.upload', 'files.url', 'files.delete']);
  assert.equal(api.calls[0].conversationId, 'conversation-1');
  assert.equal(api.calls[1].payload.mode, 'preview');
  assert.deepEqual(api.calls[2].payload, { attachmentId: 'attachment-1' });
  assert.equal('objectPath' in api.calls[2].payload, false);
});

test('notification, settings and search repositories map to authenticated server actions', async () => {
  const api = makeApi();
  const notifications = new NotificationRepository(api);
  const settings = new SettingsRepository(api);
  const search = new SearchRepository(api);
  await notifications.list();
  await notifications.markRead('notification-1');
  await notifications.markAllRead();
  await settings.get();
  await settings.update({ inAppNotifications: false });
  await search.conversations('equipo');
  await search.messages('documento');
  assert.deepEqual(api.calls.map((call) => call.action), [
    'notifications.list', 'notifications.read', 'notifications.read-all',
    'settings.get', 'settings.update', 'conversations.search', 'search.messages',
  ]);
});

test('attachment controller rejects excessive pending files and uploads allowed images through the repository', async () => {
  const calls = [];
  const updates = [];
  const model = {
    state: { activeConversation: { id: 'c1' }, pendingAttachments: [] },
    files: { upload: async (conversationId, file) => { calls.push({ conversationId, file }); return { id: `id-${calls.length}`, fileName: file.name, mimeType: file.type }; }, delete: async () => ({ deleted: true }) },
    update: (value) => { Object.assign(model.state, value); updates.push(value); },
  };
  const messages = [];
  const view = { toast: (message, type) => messages.push({ message, type }) };
  const controller = new AttachmentController(model, view);
  const imageFile = new Blob(['image-data'], { type: 'image/jpeg' });
  Object.defineProperty(imageFile, 'name', { value: 'photo.jpg' });
  const textFile = new Blob(['notes'], { type: 'text/plain' });
  Object.defineProperty(textFile, 'name', { value: 'notes.txt' });
  const htmlFile = new Blob(['<script/>'], { type: 'text/html' });
  Object.defineProperty(htmlFile, 'name', { value: 'script.html' });
  const files = [imageFile, textFile, htmlFile];
  const input = { files, value: 'selected' };
  await controller.uploadFromInput(input);
  assert.equal(input.value, '');
  assert.equal(calls.length, 2);
  assert.equal(model.state.pendingAttachments.length, 2);
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /script.html/);
  assert.ok(model.state.pendingAttachments[0].previewObjectUrl.startsWith('blob:'));
  controller.disposePending();
  assert.equal(model.state.pendingAttachments.length, 0);
});

test('settings controller persists privacy and notification preferences and revokes sessions through the model', async () => {
  const updates = [];
  const revoked = [];
  const model = {
    settings: { update: async (values) => { updates.push(values); return { ...values, theme: values.theme }; } },
    auth: { revokeSession: async (id) => revoked.push(id), revokeOtherSessions: async () => ({ revoked: 2 }) },
    loadDeviceSessions: async () => {},
    update: (values) => { Object.assign(model.state, values); },
    setTheme: (theme) => { model.theme = theme; },
    state: { settings: {} },
  };
  const view = { setSubmitBusy() {}, toast() {}, showModalError() {} };
  const controller = new SettingsController(model, view);
  const form = {
    elements: [],
  };
  const originalFormData = globalThis.FormData;
  globalThis.FormData = class { constructor() {} get(name) { return ({ theme: 'dark', desktopNotifications: null, messagePreviews: 'on', inAppNotifications: 'on', soundNotifications: null })[name] ?? null; } };
  try { await controller.save(form); } finally { globalThis.FormData = originalFormData; }
  assert.equal(updates[0].theme, 'dark');
  assert.equal(updates[0].desktopNotifications, false);
  assert.equal(updates[0].messagePreviews, true);
  assert.equal(updates[0].inAppNotifications, true);
  assert.equal(updates[0].soundNotifications, false);
  assert.equal(model.theme, 'dark');
  await controller.revoke('session-2');
  await controller.revokeOthers();
  assert.deepEqual(revoked, ['session-2']);
});

test('notification controller updates in-app count and avoids duplicate notification toasts', () => {
  const toasts = [];
  const model = {
    state: { user: { id: 'u1' }, notifications: [], settings: { in_app_notifications: true } },
    subscribe(listener) { this.listener = listener; return () => {}; },
  };
  const controller = new NotificationController(model, { toast: (message) => toasts.push(message) });
  controller.mount();
  controller.onState({ user: { id: 'u1' }, notifications: [{ id: 'n1', title: 'Nuevo mensaje' }], settings: { in_app_notifications: true } });
  controller.onState({ user: { id: 'u1' }, notifications: [{ id: 'n1', title: 'Nuevo mensaje' }], settings: { in_app_notifications: true } });
  controller.onState({ user: { id: 'u1' }, notifications: [{ id: 'n1', title: 'Nuevo mensaje' }, { id: 'n2', title: 'Solicitud' }], settings: { in_app_notifications: true } });
  assert.deepEqual(toasts, ['Solicitud']);
});

test('settings and notification modals render user preferences, active sessions and unread items', () => {
  const settingsHtml = renderModal({ type: 'settings', title: 'Preferencias' }, 'dark', {
    themePreference: 'dark', settings: { theme: 'dark', desktop_notifications: true, message_previews: false, in_app_notifications: true, sound_notifications: false },
    sessionsLoading: false,
    deviceSessions: [{ id: 's1', device_label: 'Nexo web · Windows', user_agent: 'Chrome', current: true }, { id: 's2', device_label: 'Teléfono', user_agent: 'Mobile', current: false }],
  });
  assert.match(settingsHtml, /Notificaciones del escritorio/);
  assert.match(settingsHtml, /Vista previa de mensajes/);
  assert.match(settingsHtml, /Nexo web · Windows/);
  assert.match(settingsHtml, /data-action="revoke-device-session" data-id="s2"/);
  assert.match(settingsHtml, /data-action="revoke-other-sessions"/);

  const notificationsHtml = renderModal({ type: 'notifications', title: 'Notificaciones' }, 'light', {
    notifications: [{ id: 'n1', title: 'Nuevo mensaje', body: 'Contenido privado', kind: 'new_message', created_at: '2026-11-10T10:00:00Z', read_at: null }],
    unreadNotificationCount: 1,
    settings: { message_previews: false },
    notificationLoading: false,
  });
  assert.match(notificationsHtml, /Nuevo mensaje/);
  assert.doesNotMatch(notificationsHtml, /Contenido privado/);
  assert.match(notificationsHtml, /data-action="notifications-read-all"/);
});

test('search and file preview modals render only supplied server search results and signed image URLs', () => {
  const searchHtml = renderModal({ type: 'search-results', title: 'Resultados', conversationResults: [{ id: 'c1', displayTitle: 'Proyecto' }], messageResults: [{ id: 'm1', conversation_id: 'c1', conversationTitle: 'Proyecto', body: 'Acta aprobada', sender: { displayName: 'Ana' }, created_at: '2026-11-10T10:00:00Z' }] }, 'light', {});
  assert.match(searchHtml, /data-action="open-search-conversation" data-id="c1"/);
  assert.match(searchHtml, /data-action="open-search-message" data-id="m1"/);
  assert.match(searchHtml, /Acta aprobada/);

  const previewHtml = renderModal({ type: 'file-preview', title: 'photo.png', fileName: 'photo.png', fileUrl: 'https://signed.example/private?token=abc' }, 'light', {});
  assert.match(previewHtml, /<img src="https:\/\/signed.example\/private\?token=abc"/);
  assert.match(previewHtml, /rel="noopener noreferrer"/);
});

test('chat view renders pending upload chips and opens only known attachment IDs for preview/download', () => {
  globalThis.document = makeDocument();
  const root = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  const view = new AppView(root);
  const state = {
    user: { id: 'u1', displayName: 'Cuenta', username: 'cuenta' },
    conversations: [], contacts: [], incomingRequests: [], outgoingRequests: [], blockedUsers: [],
    loading: false, accountLoading: false, messagesLoading: false, messagesLoadingEarlier: false, messagesHasMore: false,
    pendingAttachments: [{ id: 'pending-1', fileName: 'preview.png', previewObjectUrl: 'blob:preview' }],
    messages: [new Message({ id: 'm1', conversation_id: 'c1', sender_id: 'u1', body: 'Adjunto', created_at: '2026-11-10T10:00:00Z', attachments: [{ id: 'f1', file_name: 'acta.pdf', mime_type: 'application/pdf', byte_size: 1200 }] })],
    presence: [], networkStatus: 'online', activeConversation: new Conversation({ id: 'c1', kind: 'private', displayTitle: 'Ana', members: [{ id: 'u1' }, { id: 'u2' }] }),
    replyingTo: null, historyRestore: null, detailsOpen: false, theme: 'light', modal: null, error: '', settings: { in_app_notifications: true }, unreadNotificationCount: 3,
  };
  view.render(state);
  assert.match(root.innerHTML, /pending-file-chip/);
  assert.match(root.innerHTML, /data-action="open-attachment" data-id="f1"/);
  assert.match(root.innerHTML, /data-action="choose-attachment"/);
  assert.match(root.innerHTML, /notification-badge/);
  delete globalThis.document;
});
