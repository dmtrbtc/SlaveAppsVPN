export const CONNECTION_AUTO_GROUP = 'SLAVE-AUTO'

export interface ManualTargetPlan {
  proxyName: string
  disableDesktopBalancer: boolean
}

export function planManualTarget(
  proxyName: string,
  isMobile: boolean,
): ManualTargetPlan {
  return {
    proxyName,
    // Do not trust a possibly stale renderer snapshot: explicitly disable the
    // desktop balancer for every concrete manual choice.
    disableDesktopBalancer: !isMobile && proxyName !== CONNECTION_AUTO_GROUP,
  }
}

export function autoTargetUsesProxyGroup(isMobile: boolean): boolean {
  return isMobile
}
