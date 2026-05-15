# UI Architecture Audit — SLAVE VPN Renderer
**Date:** 2026-05-15  
**Scope:** `apps/windows/src/renderer/src/**`  
**Status:** Pre-stabilization. 7 screens implemented. Real IPC partially wired.

---

## Executive Summary

The renderer has a solid stack choice (Zustand + TanStack Query + Framer Motion + CVA) and a clean visual direction. However, there are **3 critical bugs** that break production auth flow, **7 architectural anti-patterns** that will cause subtle UI bugs and rerender storms at scale, and a missing adapter layer that leaves IPC error handling inconsistent across every store action.

The design system is coherent in intent but inconsistently applied — inline components leak across pages, typography is ad-hoc, and state that belongs to persistent/query layer lives in component-local state.

**Must fix before any new UI work.**

---

## CRITICAL BUGS (Production Breaks)

### BUG-1: Auth login never succeeds
**File:** `stores/auth.store.ts:42–46, 51–55`

```typescript
// IPC signature: loginEmail → Promise<IpcResult<AuthTokens>>
// IpcOk<AuthTokens> = { ok: true, data: AuthTokens }
// AuthTokens = { accessToken, refreshToken, expiresAt }

const result = await ipc.auth.loginEmail({ email, password })
if (result?.user) {  // ← result.user does NOT exist. Always undefined.
  set({ user: result.user, isAuthenticated: true })
}
// Result: login call succeeds on IPC level, nothing happens in store.
```

After a successful email login, `result` is `{ ok: true, data: { accessToken, refreshToken, expiresAt } }`. There is no `.user` field. The store never sets `isAuthenticated = true`. Same bug on `loginTelegram`.

**Fix:** On login success, call `ipc.auth.getMe()` to hydrate the user object.

---

### BUG-2: Bootstrap always treats user as unauthenticated
**File:** `stores/auth.store.ts:24–35`

```typescript
const user = await ipc.auth.getMe()
// user = IpcResult<User> = { ok: true, data: User } | { ok: false, error: {...} }
if (user) {           // ← always truthy — it's an object
  set({ user, isAuthenticated: true })  // sets user = IpcResult, not User
}
```

`ipc.auth.getMe()` returns `IpcResult<User>`, not `User`. The check `if (user)` is always true (an object is truthy). Then `user` (the IpcResult) is stored as the user object. Every field access on `user` in the UI gets the wrong value (e.g., `user.email` returns undefined; `user.ok` would be accessed as user identity).

**Fix:** Check `if (user.ok) set({ user: user.data, isAuthenticated: true })`.

---

### BUG-3: VPN connect/disconnect errors silently swallowed
**File:** `stores/vpn.store.ts:31–44`

```typescript
connect: async () => {
  set({ isConnecting: true })
  try {
    await ipc.vpn.connect()  // returns IpcResult<void>
    // ok/error NOT checked — errors silently ignored
  } finally {
    set({ isConnecting: false })
  }
},
```

If the engine fails to start (`ENGINE_START_FAILED`, `TUN_INIT_FAILED`, etc.), the IPC returns `{ ok: false, error: { code, message } }`. The store ignores this, resets `isConnecting`, and the UI returns to disconnected state with no error shown to the user.

**Fix:** Check `result.ok`, throw if false, surface error in store state.

---

## ARCHITECTURAL ANTI-PATTERNS

### AP-1: Duplicated connection state
**File:** `stores/vpn.store.ts:9–11, 81–83`

```typescript
isConnecting: boolean    // store flag
isDisconnecting: boolean // store flag

// AND in ConnectionOrb:
const isLoading = isConnecting || isDisconnecting ||
  state === 'connecting' || state === 'disconnecting' || state === 'reconnecting'
```

`isConnecting` in the store and `status.state === 'connecting'` track the same thing. They can diverge: `isConnecting` is set optimistically, but when the IPC event arrives (`onVpnStatus`), `status.state` becomes `'connecting'` while `isConnecting` is still resetting in `finally`. This causes a visible flash where the orb briefly returns to non-loading state.

**Fix:** Remove `isConnecting`/`isDisconnecting` from the store. Derive loading state exclusively from `status.state`. The orb should read only `status.state`.

---

### AP-2: forceUpdate rerender storm in DashboardPage
**File:** `pages/DashboardPage.tsx:29–36`

```typescript
const [, forceUpdate] = useState(0)
useEffect(() => {
  if (status.state !== 'connected') return
  const t = setInterval(() => forceUpdate(n => n + 1), 1000)
  return () => clearInterval(t)
}, [status.state])
```

AND:
```typescript
const { status, traffic, engineVersion } = useVpnStore()
// No selector — subscribes to entire store
```

Two rerender sources fire simultaneously: traffic events (every 1s from IPC) AND the forceUpdate interval (every 1s). Result: DashboardPage rerenders up to **2× per second** when connected, re-rendering all 4 StatCards even though only uptime changes per forceUpdate and only speed numbers change per traffic event.

**Fix:** (1) Use `useVpnStore(selector)` to subscribe to only the relevant slices. (2) Move the uptime display into an isolated `<UptimeClock connectedAt={...} />` component that manages its own interval, breaking out of the parent rerender cycle.

---

### AP-3: IPC result not unwrapped at call sites
**File:** All stores — `vpn.store.ts`, `auth.store.ts` (see BUG-1/2/3)

There is no consistent IpcResult unwrapping strategy. Some call sites `await ipc.x.y()` and ignore the result entirely, some check `.ok` inconsistently, BUG-1/2/3 stem from this. Every future store action has the same failure mode.

**Fix:** Create `lib/api/` adapters that wrap every IPC namespace and throw on `ok: false`. Stores call adapters, not IPC directly. Errors propagate naturally through try/catch.

---

### AP-4: Settings state split between query and component local
**File:** `pages/SettingsPage.tsx:35–39`

```typescript
const [localSettings, setLocalSettings] = useState<Partial<AppSettings>>({})
useEffect(() => {
  if (settings) setLocalSettings(settings)
}, [settings])
```

This creates a **stale shadow copy** of the TanStack Query cache in component state. When the query re-fetches, the effect may lag. Toggle updates patch `localSettings` optimistically but also need to invalidate the query. Two sources of truth for the same data.

**Fix:** Use TanStack Query's `useMutation` with `onMutate` optimistic update + `onError` rollback. The query cache IS the source of truth; no local state duplication needed.

---

### AP-5: DNS profile and server favorites in component local state
**File:** `pages/DnsPage.tsx:53`, `pages/ServersPage.tsx:42`

DNS profile is `useState('secure')` — lost on navigation, disconnected from `settings` query.  
Server favorites are `useState(new Set())` — lost on navigation, should be persisted.

Both represent user preferences that should outlive component mount/unmount cycles.

**Fix:** DNS profile → derive from `useSettings().data.dnsProfile` (requires adding `dnsProfile` to `AppSettings`). Server favorites → `ui.store` with persistence.

---

### AP-6: No IPC null safety
**File:** `lib/ipc.ts:9`

```typescript
export const ipc: SlaveVPNBridge = window.slaveVPN
```

If the preload script hasn't injected `window.slaveVPN` (dev HMR timing, test environment, preload crash), `ipc` is `undefined`. Every `ipc.x.y()` call throws `Cannot read properties of undefined`. No runtime guard exists.

**Fix:** Lazy getter + dev-mode guard:
```typescript
export function getIpc(): SlaveVPNBridge {
  if (!window.slaveVPN) throw new Error('[IPC] Bridge not available — preload not initialized')
  return window.slaveVPN
}
export const ipc = new Proxy({} as SlaveVPNBridge, {
  get: (_, prop) => getIpc()[prop as keyof SlaveVPNBridge],
})
```

---

### AP-7: `layoutId` without LayoutGroup
**File:** `components/layout/Sidebar.tsx:51`

```typescript
<motion.div layoutId="sidebar-indicator" ... />
```

Framer Motion `layoutId` requires a `LayoutGroup` ancestor to scope the shared layout animation. Without it, if two instances of Sidebar ever render (e.g., during HMR or route transitions), the indicator animation leaks between unrelated elements.

**Fix:** Wrap the sidebar nav in `<LayoutGroup id="sidebar">`.

---

### AP-8: Orphaned store action
**File:** `stores/vpn.store.ts:76`, `stores/vpn.store.ts:19`

```typescript
setEngineVersion: (v: string | null) => set({ engineVersion }),  // also: uses { engineVersion } not { engineVersion: v } — bug
```

`setEngineVersion` is in the store type and implementation but:
1. Never called from the renderer (no IPC event for engine version)
2. Has a bug: `set({ engineVersion })` uses the parameter name as shorthand, but `engineVersion` resolves to the store variable, not `v`. Should be `set({ engineVersion: v })`.

**Fix:** Either wire `onEngineVersion` IPC event and call `setEngineVersion`, or remove the action and derive it from diagnostics.

---

## PERFORMANCE ISSUES

### PERF-1: Unselective store subscriptions
**Files:** `pages/DashboardPage.tsx:28`, `components/connection/ConnectionOrb.tsx:78`

```typescript
// DashboardPage — subscribes to entire VpnStore:
const { status, traffic, engineVersion } = useVpnStore()
// Rerenders on isConnecting, isDisconnecting changes too

// ConnectionOrb — correct pattern:
const { status, isConnecting, isDisconnecting, connect, disconnect } = useVpnStore()
// Also full store — but actions ARE stable so this is acceptable
```

DashboardPage rerenders on any store change (isConnecting toggle, traffic update, status update). This is amplified by the forceUpdate interval.

**Fix:** Use `useVpnStore(s => s.status)`, `useVpnStore(s => s.traffic)` etc. separately.

---

### PERF-2: Notification auto-dismiss via setTimeout
**File:** `stores/ui.store.ts:37–40`

```typescript
setTimeout(() => set(s => ({
  notifications: s.notifications.filter(x => x.id !== id),
})), duration)
```

The timeout captures the notification ID by closure, which is fine. But the timeout is never cleared if the notification is manually dismissed first. This means after manual dismiss, a dangling timeout fires, tries to filter (harmless but unnecessary).

**Fix:** Return a cleanup handle or use a `Map<id, timeoutId>` and clear on manual dismiss.

---

### PERF-3: Diagnostics page double-fetches on mount
**File:** `pages/DiagnosticsPage.tsx:32–51`

Two separate `useQuery` calls with `staleTime: 30_000` and `staleTime: 10_000`. On first mount, both fire simultaneously. This is correct behavior — but without a shared query pre-warming in Bootstrap, the user sees two separate loading spinners briefly.

**Fix:** Pre-warm `['settings']` and `['subscription']` queries in Bootstrap. Diagnostics queries can stay page-scoped.

---

## DESIGN SYSTEM GAPS

### DS-1: Inline page-level components
**File:** `pages/SettingsPage.tsx:218–260` — `Section`, `ToggleRow`  
**File:** `pages/DiagnosticsPage.tsx:108–118` — `InfoTile`

These are reusable primitives defined inside page files. `ToggleRow` especially will be needed in any settings-like UI.

**Fix:** Move to `components/ui/` as named exports.

---

### DS-2: Typography is ad-hoc
Used across files: `text-[10px]`, `text-[11px]`, `text-xs`, `text-sm`, `text-base`, `text-xl` — no semantic naming. A change to heading size requires grep-replace across 8 files.

**Fix:** Define in `tailwind.config.js`:
```js
fontSize: {
  'caption': ['10px', { lineHeight: '14px' }],
  'label': ['11px', { lineHeight: '16px' }],
  'body-sm': ['12px', { lineHeight: '18px' }],
  // ... etc
}
```

---

### DS-3: Duplicate utility function with different semantics
**File:** `pages/DiagnosticsPage.tsx:17–21` vs `lib/utils.ts`

```typescript
// DiagnosticsPage (MB input):
function formatBytes(mb: number) { ... }

// lib/utils.ts (bytes input):
export function formatBytes(bytes: number): string { ... }
```

Same name, incompatible signatures. `formatUptime` is also duplicated.

**Fix:** Remove local versions. Export `formatMemoryMb(mb: number)` from `lib/utils.ts` for the MB case.

---

### DS-4: No Empty, Loading, Error state components
Each page handles loading/empty/error differently:
- ServersPage: `<Spinner />` centered in div
- DiagnosticsPage: spinner + terminal icon + "Нет" text
- SettingsPage: spinner
- DnsPage: nothing (no loading state shown)

**Fix:** Standardize `<EmptyState icon label />`, `<LoadingState />`, `<ErrorState error retry />`.

---

### DS-5: Feature-specific CSS in global scope
**File:** `index.css` — `.orb-connected`, `.orb-disconnected`, `.orb-connecting`, `.orb-error`

These are styles for a single component (`ConnectionOrb`) living in global CSS. They use `@apply` with complex shadow tokens. If ConnectionOrb is refactored, the global CSS becomes dead code with no obvious link.

**Fix:** Move orb styles into the component as inline Tailwind classes or a scoped CSS module. Keep global CSS for truly global utilities: `drag-region`, `glass`, `font-*`.

---

## PROVIDER UX GAPS

### PUX-1: Zero provider awareness in renderer
The renderer has no concept of `ProviderManifest`, `ProviderCapabilities`, or `ProviderDescriptor`. The IPC bridge has no `provider` namespace. This means:
- UI cannot adapt to provider capabilities (e.g., disable "Servers" tab if provider doesn't expose servers)
- No provider branding (name, logo, accent color)
- No capability-gated features (kill switch, split tunnel, custom rules)

**Fix:** Add `provider` namespace to `SlaveVPNBridge`:
```typescript
provider: {
  getManifest: () => Promise<IpcResult<ProviderManifest>>
  getCapabilities: () => Promise<IpcResult<ProviderCapabilities>>
}
```
Pre-fetch in Bootstrap. Gate sidebar items on capabilities.

---

### PUX-2: Hardcoded Remnawave assumption in SettingsPage
**File:** `pages/SettingsPage.tsx:98–111`

`ipc.subscription.get()` — subscription is a Remnawave concept. Providers that don't implement `SubscriptionProvider` will return errors. The UI should check `capabilities.hasSubscription` before showing the subscription section.

---

## ROUTING ISSUES

### RT-1: No Suspense boundary
Pages load synchronously. When TanStack Query fetches on mount, there's a spinner-inside-page pattern. No React Suspense is used. This is acceptable for now but creates inconsistent loading UX (some pages show spinners, others show nothing while fetching).

---

### RT-2: No 404 route
The router has no catch-all route. Navigating to an unknown path renders nothing.

---

## PRIORITIZED REMEDIATION PLAN

### Priority 0 — Critical Bugs (fix now, nothing else matters)
1. `auth.store.ts` — Fix `loginEmail`/`loginTelegram` to properly unwrap IpcResult + call getMe
2. `auth.store.ts` — Fix `bootstrap` to unwrap IpcResult<User>
3. `vpn.store.ts` — Check `result.ok` in `connect`/`disconnect`, throw on error

### Priority 1 — Architecture (fixes rerender storms + state bugs)
4. Create `lib/api/` adapter layer — all IPC wrapped, IpcResult unwrapped, errors thrown
5. Remove `isConnecting`/`isDisconnecting` from vpn.store — derive from status.state
6. Fix `setEngineVersion` bug (`{ engineVersion: v }`) or remove
7. Add `LayoutGroup` to Sidebar
8. Fix ipc.ts null safety
9. Move DNS profile and server favorites to persistent state
10. Replace SettingsPage `localSettings+useEffect` with mutation+optimistic update

### Priority 2 — Design System (consistency + composability)
11. Extract `Section`, `ToggleRow`, `InfoTile` to `components/ui/`
12. Add `EmptyState`, `LoadingState`, `ErrorState` components
13. Remove duplicate `formatBytes`/`formatUptime` from DiagnosticsPage
14. Move orb CSS from global to component scope

### Priority 3 — Performance
15. Add `UptimeClock` sub-component to isolate 1s rerender
16. Add selectors to DashboardPage store subscriptions
17. Fix notification auto-dismiss cleanup

### Priority 4 — Provider Foundation
18. Add `provider` IPC namespace + ProviderManifest/Capabilities types
19. Bootstrap pre-fetches provider manifest
20. Gate sidebar navigation items on capabilities

### Priority 5 — Folder Structure (do after P0-P2 are clean)
21. Restructure into `features/` + `shared/` — thin pages delegate to feature modules
22. Add `hooks/` per feature: `useSettings`, `useSubscription`, `useDiagnostics`
23. Pre-warm `['settings']` and `['subscription']` queries in Bootstrap

---

## Architecture Decision Record

**ADR-1: Keep stores as the async action layer**  
Stores remain the single place that calls IPC (via adapters). No IPC calls in components.

**ADR-2: Adapters throw, stores catch**  
The `lib/api/` adapters unwrap `IpcResult<T>` and throw `AppError` on `ok: false`. Stores use try/catch to surface errors into state. Components see either data or error states, never raw IPC DTOs.

**ADR-3: TanStack Query owns all IPC reads; Zustand owns all event-driven state**  
Rule: if data comes from a one-shot IPC call → `useQuery`. If data arrives via event subscription → Zustand. No hybrid (DnsPage violates this — DNS profile is settings, should be a query).

**ADR-4: Components never call IPC directly**  
Renderer boundary: `component → store action` or `component → useQuery/useMutation`. Never `component → ipc.x.y()` directly.

**ADR-5: Provider capability gating at the feature level, not in pages**  
Each feature module exports a `useFeatureAvailable()` hook that reads from provider capabilities. Pages don't contain capability checks inline.

**ADR-6: Status.state is the single source of connection truth**  
`isConnecting` and `isDisconnecting` store flags are removed. All connection state comes from `status.state`. Derived booleans are computed at usage sites via selectors.
