import { useMemo } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatSpeed } from '@slave-vpn/shared'
import { useTrafficHistory } from '../../hooks/useTrafficHistory'
import { cn } from '../../lib/utils'

interface Props {
  className?: string
  height?: number
}

// Build a smooth SVG path from a value series. We normalise to [0, max] so
// both up and down curves share the same vertical scale (capped at the joint peak).
function buildPath(values: number[], max: number, width: number, height: number): string {
  if (values.length < 2 || max <= 0) {
    return `M 0 ${height} L ${width} ${height}`
  }
  const stepX = width / (values.length - 1)
  let d = ''
  values.forEach((v, i) => {
    const x = i * stepX
    const y = height - (v / max) * height
    d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`
  })
  return d
}

function buildAreaPath(values: number[], max: number, width: number, height: number): string {
  if (values.length < 2 || max <= 0) {
    return `M 0 ${height} L ${width} ${height} Z`
  }
  const stepX = width / (values.length - 1)
  const top: string[] = []
  values.forEach((v, i) => {
    const x = i * stepX
    const y = height - (v / max) * height
    top.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  })
  return `M 0 ${height} L ${top.join(' L ')} L ${width} ${height} Z`
}

export function TrafficSparkline({ className, height = 64 }: Props) {
  const { samples, peakUp, peakDown } = useTrafficHistory({ capacity: 60 })

  const last = samples[samples.length - 1] ?? { upBps: 0, downBps: 0, ts: 0 }
  const sharedMax = Math.max(peakUp, peakDown, 1024)  // floor to 1KB/s so noise doesn't dominate

  const width = 320  // viewBox width; svg scales

  const downPath = useMemo(
    () => buildPath(samples.map(s => s.downBps), sharedMax, width, height),
    [samples, sharedMax, height],
  )
  const downArea = useMemo(
    () => buildAreaPath(samples.map(s => s.downBps), sharedMax, width, height),
    [samples, sharedMax, height],
  )
  const upPath = useMemo(
    () => buildPath(samples.map(s => s.upBps), sharedMax, width, height),
    [samples, sharedMax, height],
  )
  const upArea = useMemo(
    () => buildAreaPath(samples.map(s => s.upBps), sharedMax, width, height),
    [samples, sharedMax, height],
  )

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border border-border bg-bg-primary p-3', className)}>
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-text-secondary">
            <ArrowDown className="h-3 w-3 text-connected" />
            <span className="font-mono">{formatSpeed(last.downBps)}</span>
          </span>
          <span className="flex items-center gap-1 text-text-secondary">
            <ArrowUp className="h-3 w-3 text-accent" />
            <span className="font-mono">{formatSpeed(last.upBps)}</span>
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-text-muted">
          {samples.length}s окно
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="dl-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(34 197 94)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ul-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline */}
        <line x1="0" y1={height - 0.5} x2={width} y2={height - 0.5} stroke="currentColor" className="text-border" strokeWidth="0.5" />

        {/* Download area + line */}
        <path d={downArea} fill="url(#dl-grad)" />
        <path d={downPath} fill="none" stroke="rgb(34 197 94)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Upload area + line */}
        <path d={upArea} fill="url(#ul-grad)" />
        <path d={upPath} fill="none" stroke="rgb(99 102 241)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  )
}
