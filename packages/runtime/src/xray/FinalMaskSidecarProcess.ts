import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

interface Listener {
  port: number
  username: string
  password: string
}

/** Owns one Xray child. The config travels over stdin and stays out of argv and log files. */
export class FinalMaskSidecarProcess {
  private child: ChildProcess | null = null
  private exited: Promise<void> | null = null

  async start(binaryPath: string, config: string, listener: Listener): Promise<void> {
    if (this.child) throw new Error('FinalMask Xray is already running')
    const child = spawn(binaryPath, ['run', '-format', 'json', '-config', 'stdin:'], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
    this.child = child
    this.exited = new Promise(resolve => {
      child.once('error', () => { /* close also follows a failed spawn */ })
      child.once('close', () => {
        if (this.child === child) this.child = null
        resolve()
      })
    })
    child.stdin?.on('error', () => { /* failure is detected by exit or the readiness deadline */ })
    child.stdin?.end(config)

    try {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline && this.child === child) {
        if (await authenticate(listener) && this.child === child) return
        await delay(100)
      }
      throw new Error('FinalMask Xray did not open its authenticated loopback listener')
    } catch (error) {
      if (this.child === child) await this.stop()
      throw error
    }
  }

  async stop(): Promise<void> {
    const child = this.child
    const exited = this.exited
    if (!child || !exited) return
    child.kill('SIGKILL')
    const deadline = new AbortController()
    try {
      await Promise.race([
        exited,
        delay(3000, undefined, { signal: deadline.signal }).then(() => {
          throw new Error('FinalMask Xray termination could not be confirmed')
        }),
      ])
    } finally {
      deadline.abort()
    }
  }
}

function authenticate({ port, username, password }: Listener): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port })
    const user = Buffer.from(username)
    const pass = Buffer.from(password)
    let pending = Buffer.alloc(0)
    let negotiated = false
    const finish = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(350)
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
    socket.once('close', () => resolve(false))
    socket.once('connect', () => socket.write(Buffer.from([5, 1, 2])))
    socket.on('data', bytes => {
      pending = Buffer.concat([pending, bytes])
      if (pending.length < 2) return
      if (negotiated) {
        finish(pending[0] === 1 && pending[1] === 0)
        return
      }
      if (pending[0] !== 5 || pending[1] !== 2 || pending.length !== 2) {
        finish(false)
        return
      }
      negotiated = true
      pending = Buffer.alloc(0)
      socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]))
    })
  })
}
