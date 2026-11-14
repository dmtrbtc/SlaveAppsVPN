const XHTTP_MODES = new Set(['auto', 'packet-up', 'stream-up', 'stream-one'])

// Xray share links use Xray's JSON names, while Mihomo expects these YAML keys.
const EXTRA_FIELDS = {
  headers: 'headers',
  noGRPCHeader: 'no-grpc-header',
  xPaddingBytes: 'x-padding-bytes',
  xPaddingObfsMode: 'x-padding-obfs-mode',
  xPaddingKey: 'x-padding-key',
  xPaddingHeader: 'x-padding-header',
  xPaddingPlacement: 'x-padding-placement',
  xPaddingMethod: 'x-padding-method',
  uplinkHttpMethod: 'uplink-http-method',
  sessionIDPlacement: 'session-placement',
  sessionIDKey: 'session-key',
  sessionIDTable: 'session-table',
  sessionIDLength: 'session-length',
  seqPlacement: 'seq-placement',
  seqKey: 'seq-key',
  uplinkDataPlacement: 'uplink-data-placement',
  uplinkDataKey: 'uplink-data-key',
  uplinkChunkSize: 'uplink-chunk-size',
  scMaxEachPostBytes: 'sc-max-each-post-bytes',
  scMinPostsIntervalMs: 'sc-min-posts-interval-ms',
} as const

const REUSE_FIELDS = {
  maxConcurrency: 'max-concurrency',
  maxConnections: 'max-connections',
  cMaxReuseTimes: 'c-max-reuse-times',
  hMaxRequestTimes: 'h-max-request-times',
  hMaxReusableSecs: 'h-max-reusable-secs',
  hKeepAlivePeriod: 'h-keep-alive-period',
} as const

export class UnsupportedProxyUriError extends Error {}

function asOptions(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new UnsupportedProxyUriError('XHTTP: ожидается объект параметров')
}

function mapOptions(
  source: Record<string, unknown>,
  fields: Readonly<Record<string, string>>,
  group: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    const target = fields[key]
    if (!target || !Object.prototype.hasOwnProperty.call(fields, key)) {
      throw new UnsupportedProxyUriError(`XHTTP: в этой версии клиента есть неподдерживаемые параметры ${group}`)
    }
    if (value == null) continue
    if (key === 'headers') {
      const headers = asOptions(value)
      if (Object.values(headers).some(header => typeof header !== 'string')) {
        throw new UnsupportedProxyUriError('XHTTP: значения заголовков должны быть строками')
      }
      result[target] = headers
    } else if (key === 'noGRPCHeader' || key === 'xPaddingObfsMode') {
      if (typeof value !== 'boolean') throw new UnsupportedProxyUriError('XHTTP: некорректный логический параметр')
      result[target] = value
    } else if (key === 'hKeepAlivePeriod') {
      if (!Number.isSafeInteger(value)) throw new UnsupportedProxyUriError('XHTTP: некорректный интервал keep-alive')
      result[target] = value
    } else {
      if (typeof value !== 'string' && !Number.isSafeInteger(value)) {
        throw new UnsupportedProxyUriError('XHTTP: некорректное значение параметра')
      }
      result[target] = String(value)
    }
  }
  return result
}

export function parseXhttpOptions(query: URLSearchParams): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  const mode = query.get('mode')
  if (mode && !XHTTP_MODES.has(mode)) {
    throw new UnsupportedProxyUriError('XHTTP: режим подключения не поддерживается')
  }
  for (const key of ['path', 'host', 'mode']) {
    const value = query.get(key)
    if (value) opts[key] = value
  }

  const extra = query.get('extra')
  if (!extra) return opts

  let parsed: unknown
  try {
    parsed = JSON.parse(extra)
  } catch {
    throw new UnsupportedProxyUriError('XHTTP: параметр extra содержит некорректный JSON')
  }

  const { xmux, downloadSettings, ...fields } = asOptions(parsed)
  if (downloadSettings != null) {
    throw new UnsupportedProxyUriError('XHTTP: импорт отдельного канала downloadSettings не поддерживается')
  }
  Object.assign(opts, mapOptions(fields, EXTRA_FIELDS, 'extra'))
  if (xmux != null) opts['reuse-settings'] = mapOptions(asOptions(xmux), REUSE_FIELDS, 'XMUX')
  return opts
}
