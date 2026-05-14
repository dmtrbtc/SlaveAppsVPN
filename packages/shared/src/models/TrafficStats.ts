export interface TrafficStats {
  uploadBytes: number
  downloadBytes: number
  uploadSpeedBps: number
  downloadSpeedBps: number
  sessionUploadBytes: number
  sessionDownloadBytes: number
  sessionStartedAt: number | null
}

export interface TrafficSnapshot {
  timestamp: number
  uploadSpeedBps: number
  downloadSpeedBps: number
}

export const EMPTY_TRAFFIC_STATS: TrafficStats = {
  uploadBytes: 0,
  downloadBytes: 0,
  uploadSpeedBps: 0,
  downloadSpeedBps: 0,
  sessionUploadBytes: 0,
  sessionDownloadBytes: 0,
  sessionStartedAt: null,
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i ?? 0)
  const unit = units[i] ?? 'B'
  return `${value.toFixed(i === 0 ? 0 : 1)} ${unit}`
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}
