import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModal } from '../src/views/components/Modal.js';
import { ApiClient } from '../src/services/ApiClient.js';
import { ContactRepository } from '../src/models/repositories/ContactRepository.js';
import { ProfileRepository } from '../src/models/repositories/ProfileRepository.js';

 test('profile editor renders editable identity fields and private email as read-only', () => {
  const html = renderModal({ type: 'profile', title: 'Mi perfil' }, 'light', {
    user: {
      id: 'user-1', email: 'private@example.invalid', username: 'nexo_user',
      displayName: 'Nombre visible', bio: 'Biografía', avatarUrl: null,
    },
  });
  assert.match(html, /data-form="profile-update"/);
  assert.match(html, /data-form="profile-avatar"/);
  assert.match(html, /name="username"/);
  assert.match(html, /name="displayName"/);
  assert.match(html, /type="email"[^>]*disabled/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,image\/gif"/);
});

test('contact manager exposes accept, reject, cancel and unblock actions from server data', () => {
  const html = renderModal({ type: 'contacts', title: 'Contactos' }, 'light', {
    contactTab: 'requests', accountLoading: false,
    contacts: [],
    incomingRequests: [{ id: 'request-in', user: { id: 'user-a', username: 'ana', displayName: 'Ana' } }],
    outgoingRequests: [{ id: 'request-out', user: { id: 'user-b', username: 'bruno', displayName: 'Bruno' } }],
    blockedUsers: [],
  });
  assert.match(html, /data-decision="accept"/);
  assert.match(html, /data-decision="reject"/);
  assert.match(html, /data-action="cancel-contact"/);
  assert.match(html, /Ana/);
  assert.match(html, /Bruno/);

  const blockedHtml = renderModal({ type: 'contacts', title: 'Contactos' }, 'light', {
    contactTab: 'blocked', accountLoading: false, contacts: [], incomingRequests: [], outgoingRequests: [],
    blockedUsers: [{ id: 'blocked-user', username: 'mario', displayName: 'Mario' }],
  });
  assert.match(blockedHtml, /data-action="unblock-user"/);
});

test('profile and contact repositories map requests to server-owned actions', async () => {
  const calls = [];
  const api = {
    request: async (action, payload) => { calls.push({ action, payload }); return { ok: true }; },
    requestMultipart: async (form) => { calls.push({ action: form.get('action'), file: form.get('file') }); return { avatarUrl: 'https://signed.example/avatar' }; },
  };
  const profiles = new ProfileRepository(api);
  const contacts = new ContactRepository(api);

  await profiles.update({ username: 'nexo_user', displayName: 'Nexo User', bio: 'Hola' });
  const uploaded = await profiles.uploadAvatar(new Blob(['fake'], { type: 'image/png' }));
  await profiles.deleteAvatar();
  await contacts.respond('request-id', 'accept');
  await contacts.cancel('request-id');
  await contacts.remove('target-id');
  await contacts.block('target-id');
  await contacts.unblock('target-id');
  await contacts.listBlocked();

  assert.equal(uploaded.avatarUrl, 'https://signed.example/avatar');
  assert.deepEqual(calls.map((item) => item.action), [
    'profile.update', 'profile.avatar.upload', 'profile.avatar.delete',
    'contacts.respond', 'contacts.cancel', 'contacts.remove',
    'users.block', 'users.block', 'users.blocks.list',
  ]);
  assert.equal(calls[6].payload.blocked, true);
  assert.equal(calls[7].payload.blocked, false);
});

test('multipart upload sends the session bearer token and leaves Content-Type to the browser', async () => {
  const previousFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = options;
    return new Response(JSON.stringify({ ok: true, data: { avatarUrl: 'https://signed.example/avatar' } }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const client = new ApiClient({ get: () => ({ token: 'opaque-access-token', refreshToken: 'opaque-refresh-token' }) });
    const body = new FormData();
    body.set('action', 'profile.avatar.upload');
    body.set('file', new Blob(['test-image'], { type: 'image/png' }), 'avatar.png');
    const result = await client.requestMultipart(body);
    assert.equal(result.avatarUrl, 'https://signed.example/avatar');
    assert.equal(captured.headers.Authorization, 'Bearer opaque-access-token');
    assert.ok(captured.headers.apikey);
    assert.equal(captured.headers['Content-Type'], undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('app view renders profile and contact entry points without inventing conversations', async () => {
  const { AppView } = await import('../src/views/AppView.js');
  globalThis.document = {
    documentElement: { dataset: {} },
    body: { classList: { toggle() {} } },
  };
  const root = { innerHTML: '' };
  const view = new AppView(root);
  view.render({
    user: { id: 'u1', displayName: 'Cuenta real', username: 'cuenta', avatarUrl: null },
    conversations: [], contacts: [], incomingRequests: [], outgoingRequests: [], blockedUsers: [],
    loading: false, messagesLoading: false, messages: [], activeConversation: null,
    detailsOpen: false, theme: 'light', modal: null, error: '',
  });
  assert.match(root.innerHTML, /data-action="open-profile"/);
  assert.match(root.innerHTML, /data-action="open-contacts"/);
  assert.match(root.innerHTML, /Todavía no hay chats/);
  assert.doesNotMatch(root.innerHTML, /Alice|Bob|Hola, ¿cómo estás\?/);
  delete globalThis.document;
});

test('profile controller validates and submits profile fields through the repository', async () => {
  const { ProfileController } = await import('../src/controllers/ProfileController.js');
  const calls = [];
  const model = {
    state: { user: null },
    profile: { update: async (value) => { calls.push(value); return { id: 'user-1', username: value.username, displayName: value.displayName, bio: value.bio }; } },
    update(value) { Object.assign(this.state, value); },
  };
  const view = {
    setSubmitBusy() {},
    showModalError(message) { throw new Error(message); },
    toast() {},
  };
  const originalFormData = globalThis.FormData;
  globalThis.FormData = class { entries() { return [['username', 'new_user'], ['displayName', 'New Name'], ['bio', 'Bio text']][Symbol.iterator](); } };
  try {
    await new ProfileController(model, view).submit({ dataset: { form: 'profile-update' } });
  } finally {
    globalThis.FormData = originalFormData;
  }
  assert.deepEqual(calls[0], { username: 'new_user', displayName: 'New Name', bio: 'Bio text' });
  assert.equal(model.state.user.username, 'new_user');
  assert.equal(model.state.modal, null);
});

test('contact controller sends decisions and block/unblock operations through repositories', async () => {
  const { ContactController } = await import('../src/controllers/ContactController.js');
  const calls = [];
  const model = {
    state: { user: { id: 'owner' } },
    contacts: {
      respond: async (id, decision) => calls.push(['respond', id, decision]),
      block: async (id) => calls.push(['block', id]),
      unblock: async (id) => calls.push(['unblock', id]),
    },
    async loadAccountData() {},
  };
  const view = { root: { querySelector() { return { focus() {} }; } }, toast() {} };
  const controller = new ContactController(model, view);
  await controller.respond('req-1', 'accept');
  await controller.block('user-2');
  await controller.unblock('user-2');
  assert.deepEqual(calls, [
    ['respond', 'req-1', 'accept'],
    ['block', 'user-2'],
    ['unblock', 'user-2'],
  ]);
});
