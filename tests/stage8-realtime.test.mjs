import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceRepository } from '../src/models/repositories/PresenceRepository.js';
import { Message } from '../src/models/entities/Message.js';
import { Conversation } from '../src/models/entities/Conversation.js';
import { AppView } from '../src/views/AppView.js';
import { RealtimeSyncController } from '../src/controllers/RealtimeSyncController.js';

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

test('presence repository uses authenticated Edge Function actions and never accepts a client user ID', async () => {
  const calls = [];
  const api = { request: async (action, payload) => { calls.push({ action, payload }); return []; } };
  const repository = new PresenceRepository(api);
  await repository.ping('conversation-1', true);
  await repository.ping(null, false);
  await repository.inConversation('conversation-1');
  assert.deepEqual(calls.map((call) => call.action), [
    'presence.ping', 'presence.ping', 'presence.conversation',
  ]);
  assert.equal(calls[0].payload.conversationId, 'conversation-1');
  assert.equal(calls[0].payload.typing, true);
  assert.equal(calls[1].payload.typing, false);
  assert.equal('userId' in calls[0].payload, false);
});

test('model polling refreshes read receipts on known messages and deduplicates incoming messages', async () => {
  const { AppModel } = await import('../src/models/AppModel.js');
  let listAfterCalls = 0;
  let readCalls = 0;
  const initial = new Message({
    id: 'm1', conversation_id: 'c1', sender_id: 'u1', body: 'Hola',
    created_at: '2026-11-10T10:00:00.000Z', receipts: [{ user_id: 'u2', delivered_at: '2026-11-10T10:00:03.000Z', read_at: null }],
  });
  const refreshed = new Message({
    id: 'm1', conversation_id: 'c1', sender_id: 'u1', body: 'Hola',
    created_at: '2026-11-10T10:00:00.000Z', receipts: [{ user_id: 'u2', delivered_at: '2026-11-10T10:00:03.000Z', read_at: '2026-11-10T10:00:05.000Z' }],
  });
  const incoming = new Message({
    id: 'm2', conversation_id: 'c1', sender_id: 'u2', body: 'Recibido',
    created_at: '2026-11-10T10:00:06.000Z',
  });
  const model = new AppModel({
    authRepository: {}, profileRepository: {}, conversationRepository: {}, contactRepository: {}, groupRepository: {},
    messageRepository: {
      list: async () => [refreshed, incoming],
      listAfter: async () => { listAfterCalls += 1; return [incoming]; },
      markRead: async () => { readCalls += 1; },
    },
  });
  model.state.user = { id: 'u1' };
  model.state.activeConversation = new Conversation({ id: 'c1', kind: 'private' });
  model.state.messages = [initial];

  await model.syncNewMessages(true);
  await model.syncNewMessages(true);

  assert.equal(listAfterCalls, 2);
  assert.equal(model.state.messages.length, 2);
  assert.equal(model.state.messages[0].receipts[0].read_at, '2026-11-10T10:00:05.000Z');
  assert.equal(readCalls, 1);
});

test('model drains multiple pages after reconnect without skipping IDs', async () => {
  const { AppModel } = await import('../src/models/AppModel.js');
  let page = 0;
  const model = new AppModel({
    authRepository: {}, profileRepository: {}, conversationRepository: {}, contactRepository: {}, groupRepository: {},
    messageRepository: {
      list: async () => [],
      listAfter: async () => {
        page += 1;
        if (page === 1) return Array.from({ length: 50 }, (_, i) => new Message({
          id: `m${String(i + 1).padStart(3, '0')}`, conversation_id: 'c1', sender_id: 'u2', body: String(i + 1),
          created_at: new Date(Date.UTC(2026, 10, 10, 10, 0, i + 1)).toISOString(),
        }));
        if (page === 2) return [new Message({ id: 'm051', conversation_id: 'c1', sender_id: 'u2', body: '51', created_at: '2026-11-10T10:01:00.000Z' })];
        return [];
      },
      markRead: async () => {},
    },
  });
  model.state.user = { id: 'u1' };
  model.state.activeConversation = new Conversation({ id: 'c1', kind: 'private' });
  model.state.messages = [new Message({ id: 'm000', conversation_id: 'c1', sender_id: 'u1', body: 'Previo', created_at: '2026-11-10T09:59:00.000Z' })];
  await model.syncNewMessages(false);
  assert.equal(model.state.messages.length, 52);
  assert.equal(model.state.messages.at(-1).id, 'm051');
});

test('view displays connection, typing, last-seen and delivery/read states without fake conversations', () => {
  globalThis.document = makeDocument();
  const root = { innerHTML: '', querySelector() { return null; } };
  const view = new AppView(root);
  const state = {
    user: { id: 'u1', displayName: 'Deivid', username: 'deivid' },
    conversations: [], contacts: [], incomingRequests: [], outgoingRequests: [], blockedUsers: [],
    loading: false, accountLoading: false, messagesLoading: false, messagesLoadingEarlier: false, messagesHasMore: false,
    messages: [new Message({
      id: 'm1', conversation_id: 'c1', sender_id: 'u1', body: 'Mensaje persistido',
      created_at: '2026-11-10T10:00:00.000Z',
      receipts: [{ user_id: 'u2', delivered_at: '2026-11-10T10:00:02.000Z', read_at: '2026-11-10T10:00:03.000Z' }],
    })],
    presence: [{ userId: 'u2', username: 'ana', online: true, lastSeen: '2026-11-10T10:00:00Z', typing: true }],
    networkStatus: 'online', activeConversation: new Conversation({
      id: 'c1', kind: 'private', displayTitle: 'Ana', members: [{ id: 'u1' }, { id: 'u2' }],
    }),
    replyingTo: null, historyRestore: null, detailsOpen: false, theme: 'light', modal: null, error: '',
  };
  view.render(state);
  assert.match(root.innerHTML, /Conectado/);
  assert.match(root.innerHTML, /En línea/);
  assert.match(root.innerHTML, /ana está escribiendo/);
  assert.match(root.innerHTML, /Leído/);
  assert.doesNotMatch(root.innerHTML, /Alice|Bob|Mensaje de demostración/);
  delete globalThis.document;
});

test('sync controller throttles typing pings and clears typing after the idle window', async () => {
  const calls = [];
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.window = {
    setTimeout(callback) { calls.push({ timer: true, callback }); return calls.length; },
    clearTimeout() {},
  };
  const model = {
    state: { user: { id: 'u1' }, activeConversation: { id: 'c1' } },
    pingPresence: async (...args) => { calls.push({ ping: args }); },
  };
  const controller = new RealtimeSyncController(model, { captureHistory: () => ({ nearBottom: true }) });
  controller.userId = 'u1';
  controller.conversationId = 'c1';
  controller.onTyping();
  controller.onTyping();
  assert.equal(calls.filter((call) => call.ping).length, 1);
  await Promise.resolve();
  await controller.stopTyping();
  assert.deepEqual(calls.filter((call) => call.ping).map((call) => call.ping[1]), [true, false]);
  globalThis.window = originalWindow;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
});
