import { execFileSync } from 'child_process'
import { getLogger } from '../../../logger'

const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

// These hosts are excluded from system proxy — keeps local/LAN traffic direct.
const PROXY_OVERRIDE = 'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>'

export function enableSystemProxy(host: string, port: number): void {
  const log = getLogger()
  try {
    const proxyStr = `${host}:${port}`
    const reg = (value: string, data: string, type: string) =>
      execFileSync('reg', ['add', REG_KEY, '/v', value, '/t', type, '/d', data, '/f'], { stdio: 'ignore', timeout: 3000 })
    reg('ProxyEnable', '1', 'REG_DWORD')
    reg('ProxyServer', proxyStr, 'REG_SZ')
    reg('ProxyOverride', PROXY_OVERRIDE, 'REG_SZ')
    log.info({ proxy: proxyStr }, 'Windows system proxy enabled')
  } catch (err) {
    log.warn({ err }, 'Failed to enable Windows system proxy')
  }
}

export function disableSystemProxy(): void {
  const log = getLogger()
  try {
    execFileSync('reg', ['add', REG_KEY, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'], { stdio: 'ignore', timeout: 3000 })
    log.info('Windows system proxy disabled')
  } catch (err) {
    log.warn({ err }, 'Failed to disable Windows system proxy')
  }
}
