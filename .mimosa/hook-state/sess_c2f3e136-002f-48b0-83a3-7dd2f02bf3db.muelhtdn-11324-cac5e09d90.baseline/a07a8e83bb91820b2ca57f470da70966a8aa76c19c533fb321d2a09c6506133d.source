export const DEFAULT_FAKE_IP_FILTER: readonly string[] = [
  // РФ-direct under fake-ip: a fake IP can never match GEOIP,RU (the resolved
  // address is the synthetic 198.18.x.y), so RU domains outside geosite
  // category-ru would leak into the tunnel. Keep them on real IPs so
  // GEOIP,RU,DIRECT catches the .ru long-tail. category-ru is matched on the
  // domain by the GEOSITE rule regardless; keeping it real is consistent.
  // (Mirrors the Android buildAndroidDnsSection fix — shared so both engines
  // behave identically.)
  '+.ru',
  '+.рф',
  'geosite:category-ru',

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
