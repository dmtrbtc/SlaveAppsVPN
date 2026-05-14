export const DEFAULT_FAKE_IP_FILTER: readonly string[] = [
  // Local network patterns
  '*.lan',
  '*.local',
  '*.localdomain',
  '*.internal',
  '*.localhost',
  'localhost',
  '*.home',
  '*.corp',
  '*.invalid',

  // Windows network services
  'WORKGROUP',
  '*.WORKGROUP',
  'wpad.*',
  'isatap.*',
  'teredo.*',
  '*.msftncsi.com',
  'dns.msftncsi.com',
  'www.msftncsi.com',
  'ipv6.msftncsi.com',
  'connectivitycheck.gstatic.com',
  'captive.apple.com',
  '*.captive.apple.com',

  // Time synchronization
  '*.ntp.org',
  'pool.ntp.org',
  'time.*.com',
  'time.*.gov',
  'ntp.*.com',
  'ntp.*.org',

  // mDNS / Bonjour
  '*.local',
  '_tcp.local',
  '_udp.local',
  '_services._dns-sd._udp.local',

  // RU / CIS regional captive portal checks
  '*.captive.*',
  '*.portal.*',
  '*.hotspot.*',

  // Telegram
  '*.telegram.org',
  '*.t.me',
  'telegram.me',

  // Microsoft activation / update (should resolve to real IPs)
  'activation.sls.microsoft.com',
  'crl.microsoft.com',
  '*.windowsupdate.com',
  '*.update.microsoft.com',

  // Apple push / iCloud (must reach real IPs)
  '*.apple.com',
  '*.icloud.com',

  // Android / Google Play
  'play.googleapis.com',
  '*.gvt1.com',
  '*.gvt2.com',
]
