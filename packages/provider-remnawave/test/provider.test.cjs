const { test } = require('node:test')
const assert = require('node:assert/strict')
const { RemnawaveAuthProvider } = require('../dist/index.js')

function fakeAuthApi() {
  const calls = { loginEmail: [], widget: [], logout: 0, me: 0 }
  return {
    calls,
    async loginEmail(email, password) { calls.loginEmail.push({ email, password }); return { accessToken: 'e', refreshToken: 'r', expiresAt: 1 } },
    async loginTelegramWidget(payload) { calls.widget.push(payload); return { accessToken: 't', refreshToken: 'tr', expiresAt: 2 } },
    async logout() { calls.logout++ },
    async getMe() { calls.me++; return { id: 'u' } },
  }
}
const fakeFlow = { start: async () => ({}), cancel: () => {} }

test('loginTelegram parses initData into the widget payload', async () => {
  const api = fakeAuthApi()
  const provider = new RemnawaveAuthProvider(api, fakeFlow)

  const user = encodeURIComponent(JSON.stringify({
    id: 42, first_name: 'Иван', last_name: 'Пётр', username: 'ivan', photo_url: 'https://t.me/p.png',
  }))
  const initData = `auth_date=1770000000&query_id=AAE&user=${user}&hash=abcdef0123456789`

  const tokens = await provider.loginTelegram(initData)
  assert.equal(tokens.accessToken, 't')
  const payload = api.calls.widget[0]
  assert.equal(payload.id, 42)
  assert.equal(payload.first_name, 'Иван')
  assert.equal(payload.last_name, 'Пётр')
  assert.equal(payload.username, 'ivan')
  assert.equal(payload.photo_url, 'https://t.me/p.png')
  assert.equal(payload.auth_date, 1770000000)
  assert.equal(payload.hash, 'abcdef0123456789')
})

test('loginTelegram maps missing optional fields to absence, not undefined holes', async () => {
  const api = fakeAuthApi()
  const provider = new RemnawaveAuthProvider(api, fakeFlow)
  const user = encodeURIComponent(JSON.stringify({ id: 7, first_name: 'Ann' }))
  await provider.loginTelegram(`auth_date=5&user=${user}&hash=h`)
  const payload = api.calls.widget[0]
  assert.equal(payload.id, 7)
  assert.equal('last_name' in payload, false)
  assert.equal('username' in payload, false)
  assert.equal('photo_url' in payload, false)
  assert.equal(payload.auth_date, 5)
  assert.equal(payload.hash, 'h')
})

test('loginTelegram rejects initData without a user field', async () => {
  const provider = new RemnawaveAuthProvider(fakeAuthApi(), fakeFlow)
  await assert.rejects(() => provider.loginTelegram('auth_date=1&hash=x'), /missing user field/)
})

test('email login and session passthrough delegate to the API service', async () => {
  const api = fakeAuthApi()
  const provider = new RemnawaveAuthProvider(api, fakeFlow)
  await provider.loginEmail('a@b.c', 'pw')
  assert.deepEqual(api.calls.loginEmail, [{ email: 'a@b.c', password: 'pw' }])
  await provider.logout()
  assert.equal(api.calls.logout, 1)
  await provider.getMe()
  assert.equal(api.calls.me, 1)
})
