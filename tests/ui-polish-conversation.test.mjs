import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ConversationRepository } from '../src/models/repositories/ConversationRepository.js';
import { MessageController } from '../src/controllers/MessageController.js';
import { AppController } from '../src/controllers/AppController.js';

test('private conversation repository calls the server action with only the selected contact ID', async () => {
  const calls = [];
  const repository = new ConversationRepository({
    request: async (action, payload) => { calls.push({ action, payload }); return { conversationId: 'conversation-1', created: true }; },
  });
  const result = await repository.create('contact-1');
  assert.deepEqual(calls, [{ action: 'conversations.create', payload: { userId: 'contact-1' } }]);
  assert.equal(result.conversationId, 'conversation-1');
});

test('private conversation creation route validates accepted contacts and block state', () => {
  const source = fs.readFileSync(new URL('../supabase/functions/messenger-api/index.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf('case "conversations.create"'), source.indexOf('case "conversations.list"'));
  assert.match(route, /contacts/);
  assert.match(route, /isBlocked\(user\.id, peerId\)/);
  assert.match(route, /private_pair_key/);
  assert.match(route, /\.insert\(/);
  assert.match(route, /insertError\.code === "23505"/);
  assert.doesNotMatch(route, /\.upsert\([^;]*private_pair_key/s);
  assert.match(route, /conversation_members/);
  assert.match(route, /created_by: user\.id/);
});

test('message reactions update optimistically and prevent duplicate in-flight clicks', async () => {
  const message = { id: 'm1', reactions: [] };
  const state = { user: { id: 'u1' }, messages: [message] };
  const updates = [];
  let resolveRequest;
  const model = {
    state,
    messages: { react: () => new Promise((resolve) => { resolveRequest = resolve; }) },
    update: (values) => { Object.assign(state, values); updates.push(values); },
  };
  const view = { toast() {} };
  const controller = new MessageController(model, view);
  const pending = controller.react('m1', '👍', false);
  assert.deepEqual(message.reactions, [{ user_id: 'u1', emoji: '👍' }]);
  assert.equal(updates.length, 1);
  await controller.react('m1', '👍', false);
  assert.equal(updates.length, 1);
  resolveRequest();
  await pending;
  assert.equal(message.reactions.length, 1);
});

test('visual polish rules are defined for brand, settings, profile avatar, notification and message states', () => {
  const css = fs.readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
  for (const selector of ['.brand-mark {', '.sidebar-settings {', '.profile-avatar-form {', '.notification-row.is-unread {', '.message-quick-reaction.is-selected {', '.message-delivery-status {', '.toast--logout {']) {
    assert.ok(css.includes(selector), `Missing style ${selector}`);
  }
  assert.match(css, /message-delivery-status \{[^}]*margin-top: 1px/s);
  assert.match(css, /toast--logout \{[^}]*top:/s);
});


test('details panel can be dismissed independently from the mobile back navigation', () => {
  const view = fs.readFileSync(new URL('../src/views/AppView.js', import.meta.url), 'utf8');
  const controller = fs.readFileSync(new URL('../src/controllers/AppController.js', import.meta.url), 'utf8');
  const layout = fs.readFileSync(new URL('../src/styles/layout.css', import.meta.url), 'utf8');
  const responsive = fs.readFileSync(new URL('../src/styles/responsive.css', import.meta.url), 'utf8');
  assert.match(view, /data-action="close-details"/);
  assert.match(view, /class="details-scrim"[^>]+data-action="close-details"/);
  assert.match(controller, /case "close-details": this\.model\.update\(\{ detailsOpen: false \}\)/);
  assert.match(controller, /event\.key === "Escape" && this\.model\.state\.detailsOpen/);
  assert.match(layout, /\.app-shell\.details-open \.details-panel \{ display: flex; \}/);
  assert.match(responsive, /\.details-close \{ display: inline-grid; \}/);
  assert.match(responsive, /grid-template-columns: var\(--sidebar-width\) minmax\(0, 1fr\);/);
});

test('sidebar toolbar has a compact layout at 768px and 1024px breakpoints', () => {
  const responsive = fs.readFileSync(new URL('../src/styles/responsive.css', import.meta.url), 'utf8');
  assert.match(responsive, /@media \(min-width: 701px\) and \(max-width: 1180px\)/);
  assert.match(responsive, /\.sidebar__top > \.brand-caption \{ display: none; \}/);
  assert.match(responsive, /\.sidebar__top > \.icon-button \{ width: 34px; height: 34px; flex: 0 0 34px; \}/);
  assert.match(responsive, /\.sidebar-settings \{ margin-left: auto; \}/);
});


test('Escape closes conversation details without navigating back to the list', () => {
  const updates = [];
  const model = {
    state: { modal: null, detailsOpen: true },
    update(values) { Object.assign(this.state, values); updates.push(values); },
  };
  const view = { root: {}, focusConversationSearch() {}, trapModalFocus() {} };
  const controller = new AppController(model, view, {});
  controller.onKeydown({ key: 'Escape', target: {} });
  assert.deepEqual(updates, [{ detailsOpen: false }]);
  assert.equal(model.state.detailsOpen, false);
});
