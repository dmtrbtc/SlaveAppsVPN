import type { GeoSource } from '../settings/types.js'

/**
 * Auto-updateable geo database sources — ported verbatim from the Windows
 * GeoUpdaterService so both platforms share one catalogue. Each entry is fetched
 * (NetworkAdapter), size-validated against minBytes, then atomically swapped into
 * the rules dir (FsAdapter). The fetch/validate/swap orchestration is wired
 * per-platform in P0.3/P0.4; this is the static source list.
 */
export const GEO_SOURCES: readonly GeoSource[] = [
  {
    id: 'runetfreedom-geosite',
    label: 'RuNet Freedom geosite-ru-only',
    url: 'https://github.com/runetfreedom/russia-blocked-geosite/releases/latest/download/geosite-ru-only.dat',
    filename: 'geosite-runetfreedom.dat',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
  {
    id: 'roscomvpn-geosite',
    label: 'RoscomVPN geosite (hydraponique)',
    url: 'https://github.com/hydraponique/roscomvpn-geosite/releases/latest/download/geosite.dat',
    filename: 'geosite-roscomvpn.dat',
    minBytes: 200_000,
    category: 'geo-db',
  },
  {
    id: 'roscomvpn-geoip',
    label: 'RoscomVPN geoip (hydraponique)',
    url: 'https://github.com/hydraponique/roscomvpn-geoip/releases/latest/download/geoip.dat',
    filename: 'geoip-roscomvpn.dat',
    minBytes: 100_000,
    category: 'geo-db',
  },
  {
    id: 'meta-rules-geoip',
    label: 'MetaCubeX geoip.dat',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
    filename: 'geoip.dat',
    minBytes: 10_000_000,
    category: 'geo-db',
  },
  {
    id: 'meta-rules-geosite',
    label: 'MetaCubeX geosite.dat',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
    filename: 'geosite.dat',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
  {
    id: 'singbox-geoip',
    label: 'Sing-box geoip.db',
    url: 'https://github.com/SagerNet/sing-geoip/releases/latest/download/geoip.db',
    filename: 'geoip.db',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
  {
    id: 'singbox-geosite',
    label: 'Sing-box geosite.db',
    url: 'https://github.com/SagerNet/sing-geosite/releases/latest/download/geosite.db',
    filename: 'geosite.db',
    minBytes: 1_000_000,
    category: 'geo-db',
  },
]
