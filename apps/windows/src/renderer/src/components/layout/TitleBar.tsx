import { Minus, X, Square } from 'lucide-react'
import { cn } from '../../lib/utils'

export function TitleBar() {
  return (
    <div className="drag-region flex h-9 items-center justify-between bg-bg-base px-4 shrink-0 border-b border-border/40">
      <div className="flex items-center gap-2 no-drag">
        <div className="h-3 w-3 rounded-full bg-accent/60" />
        <span className="text-[11px] font-semibold tracking-[0.12em] text-text-muted uppercase">
          Slave VPN
        </span>
      </div>

      <div className="no-drag flex items-center">
        <TitleBarButton onClick={() => window.slaveVPN?.window?.minimize()} label="Minimize">
          <Minus className="h-3 w-3" />
        </TitleBarButton>
        <TitleBarButton onClick={() => window.slaveVPN?.window?.maximize()} label="Maximize">
          <Square className="h-2.5 w-2.5" />
        </TitleBarButton>
        <TitleBarButton onClick={() => window.slaveVPN?.window?.close()} label="Close" close>
          <X className="h-3 w-3" />
        </TitleBarButton>
      </div>
    </div>
  )
}

interface TitleBarButtonProps {
  onClick?: () => void
  label: string
  close?: boolean
  children: React.ReactNode
}

function TitleBarButton({ onClick, label, close, children }: TitleBarButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-9 w-10 items-center justify-center text-text-muted transition-colors',
        close
          ? 'hover:bg-error hover:text-white'
          : 'hover:bg-bg-tertiary hover:text-text-secondary'
      )}
    >
      {children}
    </button>
  )
}
