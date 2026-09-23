import type { AuthTokens } from '@slave-vpn/shared'

type RefreshFn = () => Promise<AuthTokens>

export class RefreshLock {
  private inflightRefresh: Promise<AuthTokens> | null = null

  async execute(refreshFn: RefreshFn): Promise<AuthTokens> {
    if (this.inflightRefresh) {
      return this.inflightRefresh
    }

    this.inflightRefresh = refreshFn().finally(() => {
      this.inflightRefresh = null
    })

    return this.inflightRefresh
  }

  isRefreshing(): boolean {
    return this.inflightRefresh !== null
  }
}
