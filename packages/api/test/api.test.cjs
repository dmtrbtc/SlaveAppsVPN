const { test } = require('node:test')
const assert = require('node:assert/strict')
const { RefreshLock } = require('../dist/index.js')
const { getCsrfToken, isMutationMethod } = require('../dist/client/CsrfToken.js')
const { createAuthRequestInterceptor } = require('../dist/client/interceptors/auth.interceptor.js')
const { createRefreshResponseInterceptor } = require('../dist/client/interceptors/refresh.interceptor.js')
const { ApiError } = require('../dist/errors/ApiError.js')

function fakeStorage(tokens = {}) {
  return {
    access: tokens.accessToken ?? null,
    refresh: tokens.refreshToken ?? null,
    cleared: 0,
    setCalls: [],
    async getAccessToken() { return this.access },
    async getRefreshToken() { return this.refresh },
    async setTokens(t) { this.setCalls.push(t); this.access = t.accessToken; this.refresh = t.refreshToken },
    async clearTokens() { this.cleared++; this.access = null; this.refresh = null },
  }
}

function reqConfig(url, method = 'get') {
  const headers = new Map()
  return { url, method, headers: { set: (k, v) => headers.set(k, v) }, __headers: headers }
}

test('CsrfToken: session-stable 64-hex token', () => {
  const a = getCsrfToken()
  assert.equal(a, getCsrfToken(), 'same token within the session')
  assert.match(a, /^[0-9a-f]{64}$/)
})

test('isMutationMethod matrix', () => {
  for (const m of ['POST', 'post', 'PUT', 'PATCH', 'DELETE']) assert.equal(isMutationMethod(m), true, m)
  for (const m of ['GET', 'get', 'HEAD', undefined]) assert.equal(isMutationMethod(m), false, String(m))
})

test('RefreshLock: concurrent refreshes collapse into one flight', async () => {
  const lock = new RefreshLock()
  let calls = 0
  const fn = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return { accessToken: 'a', refreshToken: 'r', expiresAt: 1 } }
  const [x, y, z] = await Promise.all([lock.execute(fn), lock.execute(fn), lock.execute(fn)])
  assert.equal(calls, 1, 'refresh function ran once')
  assert.equal(x, y); assert.equal(y, z)
  assert.equal(lock.isRefreshing(), false)
})

test('RefreshLock: a failed flight resets so the next attempt can run', async () => {
  const lock = new RefreshLock()
  let boom = true
  const fn = async () => {
    try {
      if (boom) throw new Error('refresh failed')
      return { accessToken: 'ok', refreshToken: 'r', expiresAt: 1 }
    } finally {
      boom = false
    }
  }
  await assert.rejects(() => lock.execute(fn), /refresh failed/)
  const tokens = await lock.execute(fn)
  assert.equal(tokens.accessToken, 'ok')
})

test('auth request interceptor: bearer everywhere except auth routes; csrf on mutations', async () => {
  const storage = fakeStorage({ accessToken: 'tok-1' })
  const ic = createAuthRequestInterceptor(storage)

  const plain = reqConfig('/cabinet/servers')
  await ic(plain)
  assert.equal(plain.__headers.get('Authorization'), 'Bearer tok-1')
  assert.equal(plain.__headers.get('X-CSRF-Token'), undefined, 'GET carries no CSRF header')

  const authRoute = reqConfig('/cabinet/auth/login', 'post')
  await ic(authRoute)
  assert.equal(authRoute.__headers.get('Authorization'), undefined, 'auth routes carry no bearer')
  assert.ok(authRoute.__headers.get('X-CSRF-Token'), 'mutations carry the CSRF token')

  const mutation = reqConfig('/cabinet/subscriptions', 'delete')
  await ic(mutation)
  assert.equal(mutation.__headers.get('Authorization'), 'Bearer tok-1')
  assert.ok(mutation.__headers.get('X-CSRF-Token'))
})

function makeAxios({ refreshResponse, retryResponse } = {}) {
  const calls = []
  const instance = async (config) => {
    calls.push(['request', config])
    return retryResponse ?? { status: 200, data: {} }
  }
  instance.post = async (url, body) => {
    calls.push(['post', url, body])
    return refreshResponse ?? { data: { access_token: 'new-access', refresh_token: 'new-refresh' } }
  }
  instance.calls = calls
  return instance
}

const err401 = (url) => ({
  isAxiosError: true, config: reqConfig(url, 'get'), response: { status: 401 },
  message: 'Request failed with status code 401',
})

test('refresh interceptor: 401 refreshes once, updates storage, retries with the new token', async () => {
  const storage = fakeStorage({ accessToken: 'stale', refreshToken: 'r1' })
  let expired = 0
  const axios = makeAxios()
  const { onRejected } = createRefreshResponseInterceptor({
    axiosInstance: axios, tokenStorage: storage, refreshLock: new RefreshLock(),
    onSessionExpired: () => { expired++ },
  })

  const response = await onRejected(err401('/cabinet/servers'))
  assert.equal(response.status, 200)
  assert.equal(expired, 0)
  assert.deepEqual(axios.calls[0], ['post', '/cabinet/auth/refresh', { refresh_token: 'r1' }])
  assert.equal(storage.access, 'new-access')
  assert.equal(storage.refresh, 'new-refresh')
  const retried = axios.calls[1][1]
  assert.equal(retried.__headers.get('Authorization'), 'Bearer new-access')
  assert.equal(retried._retry, true)
})

test('refresh interceptor: 401 on an auth route never refreshes', async () => {
  const storage = fakeStorage({ accessToken: 'a', refreshToken: 'r' })
  const axios = makeAxios()
  const { onRejected } = createRefreshResponseInterceptor({
    axiosInstance: axios, tokenStorage: storage, refreshLock: new RefreshLock(), onSessionExpired: () => {},
  })
  await assert.rejects(() => onRejected(err401('/cabinet/auth/login')), (e) => e instanceof ApiError)
  assert.equal(axios.calls.length, 0, 'no refresh POST was made')
})

test('refresh interceptor: non-401 errors map to ApiError untouched', async () => {
  const axios = makeAxios()
  const { onRejected } = createRefreshResponseInterceptor({
    axiosInstance: axios, tokenStorage: fakeStorage(), refreshLock: new RefreshLock(), onSessionExpired: () => {},
  })
  const error = { isAxiosError: true, config: reqConfig('/x'), response: { status: 500 }, message: 'boom' }
  await assert.rejects(() => onRejected(error), (e) => e instanceof ApiError && e.message.includes('boom'))
  assert.equal(axios.calls.length, 0)
})

test('refresh interceptor: no refresh token → session expired, tokens cleared, callback fired', async () => {
  const storage = fakeStorage({ accessToken: 'a', refreshToken: null })
  let expired = 0
  const axios = makeAxios()
  const { onRejected } = createRefreshResponseInterceptor({
    axiosInstance: axios, tokenStorage: storage, refreshLock: new RefreshLock(),
    onSessionExpired: () => { expired++ },
  })
  await assert.rejects(() => onRejected(err401('/cabinet/servers')), (e) => e instanceof ApiError)
  assert.equal(expired, 1)
  assert.equal(storage.cleared, 1)
  assert.equal(axios.calls.length, 0)
})

test('refresh interceptor: a failing refresh POST expires the session exactly once', async () => {
  const storage = fakeStorage({ accessToken: 'a', refreshToken: 'dead' })
  let expired = 0
  const axios = makeAxios()
  axios.post = async () => { throw new Error('upstream down') }
  const { onRejected } = createRefreshResponseInterceptor({
    axiosInstance: axios, tokenStorage: storage, refreshLock: new RefreshLock(),
    onSessionExpired: () => { expired++ },
  })
  await assert.rejects(() => onRejected(err401('/cabinet/servers')))
  assert.equal(expired, 1)
  assert.equal(storage.cleared, 1)
})
