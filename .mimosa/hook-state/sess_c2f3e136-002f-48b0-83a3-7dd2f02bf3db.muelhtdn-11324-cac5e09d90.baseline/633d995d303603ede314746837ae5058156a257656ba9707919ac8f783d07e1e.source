import React from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  override render(): React.ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg-base p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-xl text-red-400">
            ✕
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">Ошибка интерфейса</p>
            <p className="mt-1 max-w-[240px] break-words text-xs text-text-muted">{error.message}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-accent/20 px-4 py-2 text-xs text-accent transition-colors hover:bg-accent/30"
          >
            Перезапустить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
