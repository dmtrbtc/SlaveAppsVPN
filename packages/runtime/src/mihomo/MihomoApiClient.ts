import http from 'http'

export interface MihomoVersionInfo {
  version: string
  premium: boolean
}

export interface MihomoTrafficSnapshot {
  up: number
  down: number
}

export interface MihomoConnectionsInfo {
  downloadTotal: number
  uploadTotal: number
  connections: unknown[]
}

export interface MihomoMemoryInfo {
  inuse: number
  oslimit: number
}

export class MihomoApiClient {
  private readonly authHeader: Record<string, string>

  constructor(
    private readonly port: number,
    secret: string
  ) {
    this.authHeader = secret ? { Authorization: `Bearer ${secret}` } : {}
  }

  async getVersion(): Promise<MihomoVersionInfo> {
    return this.get<MihomoVersionInfo>('/version')
  }

  async getConnections(): Promise<MihomoConnectionsInfo> {
    return this.get<MihomoConnectionsInfo>('/connections')
  }

  async getMemory(): Promise<MihomoMemoryInfo> {
    return this.get<MihomoMemoryInfo>('/memory')
  }

  async reloadConfig(configPath: string): Promise<void> {
    await this.put('/configs', { path: configPath })
  }

  async patchConfig(payload: Record<string, unknown>): Promise<void> {
    await this.patch('/configs', payload)
  }

  async closeAllConnections(): Promise<void> {
    await this.delete('/connections')
  }

  async selectProxy(groupName: string, proxyName: string): Promise<void> {
    await this.put(`/proxies/${encodeURIComponent(groupName)}`, { name: proxyName })
  }

  async isAlive(): Promise<boolean> {
    try {
      await this.getVersion()
      return true
    } catch {
      return false
    }
  }

  streamTraffic(
    onSnapshot: (snapshot: MihomoTrafficSnapshot) => void,
    onError: (err: Error) => void
  ): () => void {
    let destroyed = false
    let req: http.ClientRequest | null = null

    const start = (): void => {
      if (destroyed) return

      req = http.get(
        { hostname: '127.0.0.1', port: this.port, path: '/traffic', headers: this.authHeader },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            const text = chunk.toString().trim()
            for (const line of text.split('\n')) {
              if (!line) continue
              try {
                const parsed = JSON.parse(line) as MihomoTrafficSnapshot
                onSnapshot(parsed)
              } catch {
                // incomplete JSON chunk, skip
              }
            }
          })

          res.on('error', (err) => onError(err))
          res.on('end', () => {
            if (!destroyed) setTimeout(start, 2000)
          })
        }
      )

      req.on('error', (err) => {
        if (!destroyed) {
          onError(err)
          setTimeout(start, 5000)
        }
      })
    }

    start()

    return () => {
      destroyed = true
      req?.destroy()
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  private put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  private patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }

  private delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined

      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: this.port,
        path,
        method,
        headers: {
          ...this.authHeader,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      }

      const req = http.request(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString()
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`Mihomo API error ${res.statusCode ?? 0}: ${text}`))
            return
          }
          if (!text.trim()) {
            resolve(undefined as T)
            return
          }
          try {
            resolve(JSON.parse(text) as T)
          } catch {
            reject(new Error(`Failed to parse Mihomo API response: ${text}`))
          }
        })
      })

      req.on('error', reject)
      if (payload) req.write(payload)
      req.end()
    })
  }
}
