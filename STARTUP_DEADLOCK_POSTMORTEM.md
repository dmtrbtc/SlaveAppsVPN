# Startup Deadlock Postmortem — v0.3.0-rc1

**Date:** 2026-05-18  
**Severity:** P0 — packaged app completely non-functional  
**Symptom:** NSIS/portable build process visible in Task Manager, no window appears  
**Fix commit:** `3b94004`

---

## Root Cause #1 — pino-pretty ThreadStream deadlock (PRIMARY)

### What happened

`logger.ts: createLogger()` had a single branch for both dev and the pre-userData production case:

```typescript
// BEFORE (broken):
if (isDev || !userDataPath) {
  return pino({ transport: { target: 'pino-pretty' } })
}
```

In a packaged build: `isDev = false` (NODE_ENV is not 'development') but `!userDataPath = true` (first `initLogger()` call in `index.ts` line 42 passes no argument — `app.getPath('userData')` is only available after `app.whenReady()`).

Result: **pino-pretty transport is used unconditionally in every production launch**, before the app is ready.

### Why it deadlocked

pino uses `thread-stream` to deliver log messages to transports. `thread-stream` spawns a `Worker` thread and communicates via a `SharedArrayBuffer` + `Atomics`. When the buffer fills and the worker hasn't acknowledged, the main thread calls `Atomics.wait()` — a **synchronous block**.

In the packaged app, `pino-pretty` is a `devDependency` and is not installed. The worker thread immediately throws `Cannot find module 'pino-pretty'` and exits. At that point:

1. Buffered log messages in the SAB have no consumer to acknowledge them
2. On the next write (from `getSafeModeManager().init()` calling `getLogger().warn()`), the buffer fills
3. pino calls `Atomics.wait()` waiting for the dead worker to drain the buffer
4. **The main thread blocks indefinitely** — `app.whenReady()` never fires, no window is created

The process stays alive in Task Manager (Electron's Chrome process is running) but the main process JS event loop is frozen.

### Fix

```typescript
// AFTER (fixed):
if (!userDataPath) {
  if (isDev) {
    return pino({ transport: { target: 'pino-pretty', ... } })
  }
  // Production pre-userData: synchronous stdout, NO worker thread
  return pino({ level: 'info', ... }, pino.destination({ dest: 1, sync: true }))
}
```

`pino.destination({ dest: 1, sync: true })` writes synchronously to stdout fd=1. No worker thread, no SharedArrayBuffer, no Atomics, no possible deadlock. The second `initLogger(userDataPath)` call inside `app.whenReady()` replaces this with the persistent file logger.

---

## Root Cause #2 — Invisible window on renderer failure (SECONDARY)

### What happened

`window.ts: createMainWindow()` created the window with `show: false` and showed it only on `ready-to-show`:

```typescript
mainWindow.on('ready-to-show', () => {
  mainWindow?.show()
})
```

`ready-to-show` fires when Chromium paints the first frame. If the renderer crashes before painting (due to any error, including the downstream effects of the deadlock on subsequent launches), the event never fires. The window stays hidden. The process stays alive. The user sees nothing.

### Fix

```typescript
// 15s force-show timeout — catches all invisible-window scenarios
showTimer = setTimeout(() => {
  if (mainWindow && !mainWindow.isVisible()) {
    log.error('ready-to-show timeout — force-showing window for diagnostics')
    mainWindow.show()
  }
}, 15_000)

mainWindow.once('ready-to-show', () => {
  clearTimeout(showTimer)
  mainWindow?.show()
})
```

Additional recovery: force-show on `did-fail-load` and after renderer crash recovery limit exceeded.

---

## Root Cause #3 — SafeModeManager crash loop amplification (CONTRIBUTING)

Each launch with the deadlock set `healthy = false` in `launch-record.json` (because `scheduleHealthyMark()` never ran — the bootstrap never reached it). On subsequent launches, the crash counter incremented. After 3 launches: safe mode was entered. Safe mode only adds a UI banner (not a startup blocker), but it confirms the deadlock was repeatable.

---

## Checklist: What was audited

| Check | Finding |
|-------|---------|
| `pino-pretty` in `devDependencies` | ✅ Confirmed — not bundled in packaged app |
| `pino-pretty` called before `app.whenReady()` | ✅ Confirmed via `out/main/index.js` inspection |
| `ThreadStream` deadlock via `Atomics.wait()` | ✅ Root cause — fixed with sync stdout |
| `ready-to-show` has no timeout | ✅ Confirmed — fixed with 15s fallback |
| `better-sqlite3` unpackaged from asar | ✅ Not an issue — electron-builder auto-unpacks `.node` files |
| Workspace packages in packaged app | ✅ Not an issue — 50MB asar includes them |
| Chunk dynamic imports in asar | ✅ Not an issue — chunks are at deterministic paths inside asar |
| CSP blocking renderer | ✅ Not an issue — IPC uses ipcRenderer, not fetch |
| `sandbox: true` breaking preload | ✅ Not an issue — only `require('electron')` + bundled locals |
| `preload console.log` before import | ✅ Minor bug fixed — import moved before console.log |

---

## Prevention

1. **Never use pino transports (worker threads) before `app.whenReady()`** — userData path is unavailable and devDependencies may be absent
2. **Always add a show-timeout to hidden BrowserWindows** — any uncaught renderer failure leaves an invisible ghost process
3. **Production logger must never depend on devDependencies** — `pino-pretty`, `ts-node`, `source-map-support`, etc. are absent in packaged builds

---

## New diagnostics added

- **Startup phase logging**: `ipc_register_start/done`, `window_create_start/done`, `init_complete` — allows identifying exact hang point from `main.log`
- **WebContents events piped to main log**: `did-finish-load`, `did-fail-load`, `console-message` — renderer errors now visible in `main.log` without DevTools
- **`--safe-mode` flag**: launches with provider and runtime disabled, UI shows degraded state; useful for distinguishing bootstrap bugs from renderer bugs
- **Renderer startup log**: `[renderer] bootstrap start` + bridge availability logged at window load
