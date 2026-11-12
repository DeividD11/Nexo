import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModal } from '../src/views/components/Modal.js';
import { AppView } from '../src/views/AppView.js';
import { MessageRepository } from '../src/models/repositories/MessageRepository.js';
import { GroupRepository } from '../src/models/repositories/GroupRepository.js';
import { Message } from '../src/models/entities/Message.js';
import { Conversation } from '../src/models/entities/Conversation.js';

test('group creation modal uses only the signed-in user contacts as selectable members', () => {
  const html = renderModal({ type: 'create-group', title: 'Crear grupo' }, 'light', {
    contacts: [
      { id: 'contact-a', username: 'ana', displayName: 'Ana' },
      { id: 'contact-b', username: 'bruno', displayName: 'Bruno' },
    ],
  });
  assert.match(html, /data-form="group-create"/);
  assert.match(html, /name="memberIds" value="contact-a"/);
  assert.match(html, /name="memberIds" value="contact-b"/);
  assert.doesNotMatch(html, /example|Alice|Bob/);
});

test('group manager renders owner controls and does not expose them to ordinary members', () => {
  const state = {
    activeConversation: {
      id: 'group-id', kind: 'group', title: 'Grupo real', description: 'Descripción',
      myRole: 'owner', avatarUrl: null,
      members: [
        { id: 'owner-id', username: 'owner', displayName: 'Propietario', role: 'owner' },
        { id: 'member-id', username: 'member', displayName: 'Miembro', role: 'member' },
      ],
    },
    contacts: [{ id: 'invite-id', username: 'invitado', displayName: 'Invitado' }],
    user: { id: 'owner-id' },
    groupLoading: false,
  };
  const ownerHtml = renderModal({ type: 'group-manager', title: 'Administrar grupo' }, 'light', state);
  assert.match(ownerHtml, /data-form="group-update"/);
  assert.match(ownerHtml, /data-form="group-avatar"/);
  assert.match(ownerHtml, /data-form="group-add-member"/);
  assert.match(ownerHtml, /data-action="group-set-role" data-id="member-id" data-role="admin"/);
  assert.match(ownerHtml, /data-action="group-leave"/);

  const memberHtml = renderModal({ type: 'group-manager', title: 'Administrar grupo' }, 'light', {
    ...state,
    activeConversation: { ...state.activeConversation, myRole: 'member' },
    user: { id: 'member-id' },
  });
  assert.doesNotMatch(memberHtml, /data-form="group-update"/);
  assert.doesNotMatch(memberHtml, /data-form="group-avatar"/);
  assert.doesNotMatch(memberHtml, /data-form="group-add-member"/);
  assert.doesNotMatch(memberHtml, /data-action="group-set-role"/);
  assert.match(memberHtml, /Salir del grupo/);
});

test('message edit and delete modals bind actions to the selected server message ID', () => {
  const edit = renderModal({ type: 'edit-message', title: 'Editar', messageId: 'message-1', body: 'Texto editable' });
  assert.match(edit, /data-form="edit-message"/);
  assert.match(edit, /name="messageId" value="message-1"/);
  assert.match(edit, /Texto editable/);

  const remove = renderModal({ type: 'delete-message', title: 'Eliminar', messageId: 'message-2' });
  assert.match(remove, /data-action="confirm-delete-message"/);
  assert.match(remove, /data-id="message-2"/);
  assert.match(remove, /eliminará para todos/);
});

test('message entities preserve sender, reply, edit, delete and reaction metadata', () => {
  const message = new Message({
    id: 'm1', conversation_id: 'c1', sender_id: 'u1', body: 'Hola', reply_to: 'm0',
    edited_at: '2026-11-10T10:00:00Z', deleted_at: null,
    sender: { id: 'u1', displayName: 'Ana' }, reactions: [{ user_id: 'u2', emoji: '👍' }],
  });
  assert.equal(message.senderId, 'u1');
  assert.equal(message.replyTo, 'm0');
  assert.equal(message.sender.displayName, 'Ana');
  assert.equal(message.reactions[0].emoji, '👍');
  assert.equal(message.editedAt, '2026-11-10T10:00:00Z');
});

test('message repository uses composite cursors and server actions', async () => {
  const calls = [];
  const api = { request: async (action, payload) => { calls.push({ action, payload }); return []; } };
  const repository = new MessageRepository(api);
  await repository.list('conversation-id', '2026-11-10T10:00:00Z', 50, 'message-id');
  await repository.send('conversation-id', 'Hola', 'nonce-id', 'reply-id');
  await repository.edit('message-id', 'Texto nuevo');
  await repository.delete('message-id');
  await repository.react('message-id', '❤️', false);
  assert.deepEqual(calls.map((call) => call.action), [
    'messages.list', 'messages.send', 'messages.edit', 'messages.delete', 'messages.react',
  ]);
  assert.equal(calls[0].payload.beforeId, 'message-id');
  assert.equal(calls[1].payload.replyTo, 'reply-id');
});

test('group repository maps group permissions and avatar operations to the deployed actions', async () => {
  const calls = [];
  const api = {
    request: async (action, payload) => { calls.push({ action, payload }); return {}; },
    requestMultipart: async (form) => { calls.push({ action: form.get('action'), conversationId: form.get('conversationId') }); return {}; },
  };
  const repository = new GroupRepository(api);
  await repository.create('Equipo', 'Descripción', ['contact-1']);
  await repository.update('group-1', 'Equipo 2', 'Otra descripción');
  await repository.members('group-1');
  await repository.addMember('group-1', 'contact-2');
  await repository.removeMember('group-1', 'contact-2');
  await repository.setRole('group-1', 'contact-2', 'admin');
  await repository.uploadAvatar('group-1', new Blob(['image'], { type: 'image/png' }));
  await repository.deleteAvatar('group-1');
  assert.deepEqual(calls.map((call) => call.action), [
    'groups.create', 'groups.update', 'groups.members', 'groups.add-member',
    'groups.remove-member', 'groups.set-role', 'groups.avatar.upload', 'groups.avatar.delete',
  ]);
});

test('app view renders message tombstones, reply context, actions and no invented data', () => {
  globalThis.document = {
    documentElement: { dataset: {} },
    body: { classList: { toggle() {} } },
  };
  const root = { innerHTML: '', querySelector() { return null; } };
  const view = new AppView(root);
  const conversation = new Conversation({ id: 'c1', kind: 'group', title: 'Grupo real', members: [] });
  const state = {
    user: { id: 'u1', displayName: 'Ana', username: 'ana' },
    conversations: [], contacts: [], incomingRequests: [], outgoingRequests: [], blockedUsers: [],
    loading: false, messagesLoading: false, messagesLoadingEarlier: false, messagesHasMore: true,
    messages: [
      new Message({ id: 'm1', conversation_id: 'c1', sender_id: 'u2', body: 'Mensaje anterior', created_at: '2026-11-10T10:00:00Z', sender: { displayName: 'Bruno' } }),
      new Message({ id: 'm2', conversation_id: 'c1', sender_id: 'u1', body: '', created_at: '2026-11-10T10:01:00Z', deleted_at: '2026-11-10T10:02:00Z', reply_to: 'm1' }),
    ],
    activeConversation: conversation, replyingTo: null, historyRestore: null,
    detailsOpen: false, theme: 'light', modal: null, error: '',
  };
  view.render(state);
  assert.match(root.innerHTML, /Cargar mensajes anteriores/);
  assert.match(root.innerHTML, /Este mensaje fue eliminado/);
  assert.match(root.innerHTML, /Bruno/);
  assert.match(root.innerHTML, /data-action="reply-message"/);
  assert.doesNotMatch(root.innerHTML, /Alice|Bob|Hola, ¿cómo estás\?/);
  delete globalThis.document;
});

test('conversation entity maps group roles, description and signed avatar', () => {
  const conversation = new Conversation({
    id: 'g1', kind: 'group', displayTitle: 'Grupo', displayAvatar: 'https://storage.example/signed',
    description: 'Equipo', myRole: 'admin', members: [{ id: 'u1', role: 'admin' }],
  });
  assert.equal(conversation.title, 'Grupo');
  assert.equal(conversation.avatarUrl, 'https://storage.example/signed');
  assert.equal(conversation.description, 'Equipo');
  assert.equal(conversation.myRole, 'admin');
  assert.equal(conversation.members.length, 1);
});

test('app model loads earlier messages with the composite beforeId cursor and preserves order', async () => {
  const { AppModel } = await import('../src/models/AppModel.js');
  const calls = [];
  const model = new AppModel({
    authRepository: {}, profileRepository: {}, conversationRepository: {}, contactRepository: {}, groupRepository: {},
    messageRepository: {
      list: async (...args) => { calls.push(args); return [
        new Message({ id: 'm-old', conversation_id: 'c1', sender_id: 'u1', body: 'Anterior', created_at: '2026-11-10T09:59:00Z' }),
      ]; },
      listAfter: async () => [],
      markRead: async () => ({}),
    },
  });
  model.state.activeConversation = new Conversation({ id: 'c1', kind: 'private' });
  model.state.messages = [new Message({ id: 'm-new', conversation_id: 'c1', sender_id: 'u1', body: 'Actual', created_at: '2026-11-10T10:00:00Z' })];
  model.state.messagesHasMore = true;
  await model.loadEarlierMessages({ mode: 'height-delta', scrollTop: 20, scrollHeight: 500, nearBottom: false });
  assert.equal(calls[0][0], 'c1');
  assert.equal(calls[0][1], '2026-11-10T10:00:00Z');
  assert.equal(calls[0][3], 'm-new');
  assert.deepEqual(model.state.messages.map((message) => message.id), ['m-old', 'm-new']);
  assert.equal(model.state.historyRestore.mode, 'height-delta');
});

test('app model polls an initially empty conversation for the first incoming message', async () => {
  const { AppModel } = await import('../src/models/AppModel.js');
  let listCalls = 0;
  const model = new AppModel({
    authRepository: {}, profileRepository: {}, conversationRepository: {}, contactRepository: {}, groupRepository: {},
    messageRepository: {
      list: async () => {
        listCalls += 1;
        return listCalls === 1 ? [] : [new Message({ id: 'incoming', conversation_id: 'c1', sender_id: 'u2', body: 'Mensaje recibido', created_at: '2026-11-10T10:03:00Z' })];
      },
      listAfter: async () => [],
      markRead: async () => ({}),
    },
  });
  model.state.activeConversation = new Conversation({ id: 'c1', kind: 'private' });
  await model.syncNewMessages(true);
  assert.equal(model.state.messages.length, 0);
  await model.syncNewMessages(true);
  assert.equal(model.state.messages.length, 1);
  assert.equal(model.state.messages[0].body, 'Mensaje recibido');
  assert.equal(model.state.historyRestore.mode, 'bottom');
});
