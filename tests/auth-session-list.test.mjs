import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthRepository } from '../src/models/repositories/AuthRepository.js';
import { AppModel } from '../src/models/AppModel.js';
import { renderModal } from '../src/views/components/Modal.js';
import { ApiClient } from '../src/services/ApiClient.js';

test('AuthRepository keeps SessionStore separate from the sessions() API method', async () => {
  const calls = [];
  const store = {
    value: null,
    set(value) { this.value = value; },
    get() { return this.value; },
    updateTokens(value) { this.value = value; },
    clear() { this.value = null; },
  };
  const api = {
    request: async (action, payload, options) => {
      calls.push({ action, payload, options });
      if (action === 'devices.list') return [{ id: 'session-1', current: true }];
      if (action === 'auth.login') return { token: 'access', refreshToken: 'refresh', user: { id: 'user-1' } };
      return { message: 'ok' };
    },
  };
  const repository = new AuthRepository(api, store);

  await repository.login('account', 'password');
  const sessions = await repository.sessions();

  assert.equal(repository.sessionStore, store);
  assert.equal(typeof repository.sessions, 'function');
  assert.deepEqual(sessions, [{ id: 'session-1', current: true }]);
  assert.deepEqual(calls.map((call) => call.action), ['auth.login', 'devices.list']);
  assert.equal(store.value.token, 'access');
});

test('AppModel loads and stores the active device sessions', async () => {
  const expected = [{ id: 's-current', current: true }, { id: 's-other', current: false }];
  const model = new AppModel({
    authRepository: { sessions: async () => expected },
    profileRepository: {}, conversationRepository: {}, messageRepository: {},
    contactRepository: {}, groupRepository: {}, presenceRepository: {},
    fileRepository: {}, notificationRepository: {}, settingsRepository: {}, searchRepository: {},
  });
  model.state.user = { id: 'user-1' };
  const result = await model.loadDeviceSessions();
  assert.deepEqual(result, expected);
  assert.deepEqual(model.state.deviceSessions, expected);
  assert.equal(model.state.sessionsError, '');
});

test('settings modal shows a retry action instead of claiming there are no sessions after an API error', () => {
  const html = renderModal({ type: 'settings', title: 'Preferencias y dispositivos' }, 'light', {
    settings: {}, themePreference: 'system', deviceSessions: [], sessionsLoading: false,
    sessionsError: 'No se pudieron consultar las sesiones.',
  });
  assert.match(html, /No se pudieron cargar los dispositivos/);
  assert.match(html, /data-action="refresh-device-sessions"/);
  assert.doesNotMatch(html, /No hay sesiones activas/);
});


test('settings session rows repair legacy mojibake and render the current session as a separate badge', () => {
  const html = renderModal({ type: 'settings', title: 'Preferencias y dispositivos' }, 'light', {
    settings: {}, themePreference: 'system', sessionsLoading: false, sessionsError: '',
    deviceSessions: [{
      id: 's-current', current: true,
      device_label: 'Nexo web Ã¯Â¿Â½ Windows',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157.0 Safari/537.36',
    }],
  });
  assert.match(html, /Nexo web · Windows/);
  assert.match(html, /class="session-current-badge">Esta sesión<\/em>/);
  assert.doesNotMatch(html, /Ã¯Â¿Â½/);

  const freshSessionHtml = renderModal({ type: 'settings', title: 'Preferencias y dispositivos' }, 'light', {
    settings: {}, themePreference: 'system', sessionsLoading: false, sessionsError: '',
    deviceSessions: [{ id: 's-new', device_label: 'Nexo web - Windows', user_agent: 'Windows', current: true }],
  });
  assert.match(freshSessionHtml, /Nexo web · Windows/);
});


test('device label sent through HTTP headers stays ASCII-only', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgentData: { platform: 'Windows' }, platform: 'Win32' },
  });
  try {
    const client = new ApiClient({ get() { return null; } });
    const label = client.getDeviceLabel();
    assert.equal(label, 'Nexo web - Windows');
    assert.ok([...label].every((character) => character.codePointAt(0) <= 0x7f));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
});
