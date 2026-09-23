import net from 'net'
import type { ProbeTarget, ProbeResult, ProbeFailureReason } from './types'

const DEFAULT_TIMEOUT_MS = 3000

export class NodeProber {
  private readonly timeoutMs: number

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs
  }

  probe(target: ProbeTarget): Promise<ProbeResult> {
    return new Promise(resolve => {
      const start = Date.now()

      const socket = new net.Socket()
      socket.setTimeout(this.timeoutMs)

      const finish = (latencyMs: number | null, failureReason?: ProbeFailureReason): void => {
        socket.destroy()
        resolve({
          id: target.id,
          latencyMs,
          success: latencyMs !== null,
          timestamp: Date.now(),
          ...(failureReason ? { failureReason } : {}),
        })
      }

      socket.connect(target.port, target.server, () => {
        finish(Date.now() - start)
      })

      socket.on('error', (err: NodeJS.ErrnoException) => {
        let reason: ProbeFailureReason = 'unknown'
        if (err.code === 'ECONNREFUSED') reason = 'refused'
        else if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') reason = 'unreachable'
        finish(null, reason)
      })

      socket.on('timeout', () => {
        finish(null, 'timeout')
      })
    })
  }

  probeAll(targets: ProbeTarget[], concurrency: number): Promise<ProbeResult[]> {
    return new Promise(resolve => {
      const results: ProbeResult[] = []
      let index = 0
      let active = 0

      if (targets.length === 0) {
        resolve([])
        return
      }

      const next = (): void => {
        while (active < concurrency && index < targets.length) {
          const target = targets[index++]!
          active++
          this.probe(target).then(result => {
            results.push(result)
            active--
            if (results.length === targets.length) {
              resolve(results)
            } else {
              next()
            }
          })
        }
      }

      next()
    })
  }
}
