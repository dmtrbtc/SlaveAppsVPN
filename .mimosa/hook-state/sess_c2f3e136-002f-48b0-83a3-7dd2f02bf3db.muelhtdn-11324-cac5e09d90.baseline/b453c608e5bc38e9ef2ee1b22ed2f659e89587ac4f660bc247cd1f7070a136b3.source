import type { RoutingRule } from '../models/RoutingRule'

/**
 * Curated RU-direct allow-list (R2). These are Russian services that MUST resolve
 * over a Russian exit IP — banks (anti-fraud locks + foreign Akamai/CloudFront
 * CDNs that `geoip:RU,no-resolve` can't catch under fake-ip), the state portal /
 * gov sites, the national payment system, and RU-geo-gated streaming
 * («доступно только в России»). Many overlap geosite `category-ru`, but banks and
 * gov frequently sit on foreign CDNs, so the geosite/geoip pair alone leaks them
 * into the tunnel. An explicit DIRECT domain rule is the reliable guarantee.
 *
 * Priority 2400-2499: AFTER the proxy add-ons (1100-1999) and the scenario's own
 * blocked-site PROXY rules, BEFORE `geoip:RU,no-resolve` (2500) — so an explicit
 * RU domain goes DIRECT regardless of where its CDN resolves.
 *
 * Used by the bypass base scenarios (RoscomVPNDefault, SmartRussiaBypass) so
 * «Обход» keeps Russian banking/gov/streaming on a Russian IP on both Windows
 * and Android.
 */

let _priority = 2400

function suffix(value: string, note: string): RoutingRule {
  return {
    id: `ru-direct:${value}`,
    target: { type: 'domain_suffix', value },
    action: 'direct',
    priority: _priority++,
    source: { provider: 'ru-direct', category: note },
  }
}

// ─── Banks (anti-fraud + foreign CDN) ──────────────────────────────────────────
const BANKS: readonly RoutingRule[] = [
  // Сбер
  suffix('sberbank.ru', 'bank'),
  suffix('sber.ru', 'bank'),
  suffix('sberbank.com', 'bank'),
  suffix('sbrf.ru', 'bank'),
  suffix('sberdevices.ru', 'bank'),
  suffix('sbermarket.ru', 'bank'),
  suffix('sbermegamarket.ru', 'bank'),
  // Т-Банк (Тинькофф)
  suffix('tinkoff.ru', 'bank'),
  suffix('tbank.ru', 'bank'),
  suffix('tinkoff.com', 'bank'),
  suffix('cdn-tinkoff.ru', 'bank'),
  // ВТБ
  suffix('vtb.ru', 'bank'),
  suffix('vtb24.ru', 'bank'),
  // Альфа-Банк
  suffix('alfabank.ru', 'bank'),
  suffix('alfabank.com', 'bank'),
  suffix('alfa-bank.ru', 'bank'),
  // Газпромбанк
  suffix('gazprombank.ru', 'bank'),
  suffix('gpb.ru', 'bank'),
  // Прочие крупные банки
  suffix('raiffeisen.ru', 'bank'),
  suffix('rosbank.ru', 'bank'),
  suffix('open.ru', 'bank'),          // Открытие
  suffix('otkritie.ru', 'bank'),
  suffix('psbank.ru', 'bank'),        // Промсвязьбанк
  suffix('psb.ru', 'bank'),
  suffix('mkb.ru', 'bank'),           // Московский кредитный банк
  suffix('sovcombank.ru', 'bank'),
  suffix('pochtabank.ru', 'bank'),
  suffix('uralsib.ru', 'bank'),
  suffix('rshb.ru', 'bank'),          // Россельхозбанк
  suffix('rsb.ru', 'bank'),           // Русский Стандарт
  suffix('homecredit.ru', 'bank'),
  suffix('ozon.ru', 'bank'),          // Ozon (банк + маркетплейс)
]

// ─── Payment systems ───────────────────────────────────────────────────────────
const PAYMENTS: readonly RoutingRule[] = [
  suffix('nspk.ru', 'payment'),       // НСПК — карта «Мир» / СБП
  suffix('mironline.ru', 'payment'),  // платёжная система «Мир»
  suffix('yoomoney.ru', 'payment'),   // ЮMoney
  suffix('cbr.ru', 'payment'),        // Центробанк
]

// ─── Государство / госуслуги ────────────────────────────────────────────────────
const GOV: readonly RoutingRule[] = [
  suffix('gosuslugi.ru', 'gov'),
  suffix('gov.ru', 'gov'),            // covers *.gov.ru (nalog/pfr/sfr/minfin/…)
  suffix('mos.ru', 'gov'),            // mos.ru + *.mos.ru (mosreg etc.)
  suffix('nalog.ru', 'gov'),
  suffix('pfr.gov.ru', 'gov'),
  suffix('sfr.gov.ru', 'gov'),
  suffix('kremlin.ru', 'gov'),
  suffix('mvd.ru', 'gov'),
  suffix('gibdd.ru', 'gov'),
  suffix('roskazna.ru', 'gov'),
  suffix('rkn.gov.ru', 'gov'),
  suffix('pravo.gov.ru', 'gov'),
]

// ─── RU-geo-gated streaming («доступно только в России») ─────────────────────────
const STREAMING_RU: readonly RoutingRule[] = [
  suffix('kinopoisk.ru', 'streaming-ru'),
  suffix('hd.kinopoisk.ru', 'streaming-ru'),
  suffix('ivi.ru', 'streaming-ru'),
  suffix('ivi.tv', 'streaming-ru'),
  suffix('okko.tv', 'streaming-ru'),
  suffix('okko.sport', 'streaming-ru'),
  suffix('premier.one', 'streaming-ru'),
  suffix('wink.ru', 'streaming-ru'),
  suffix('start.ru', 'streaming-ru'),
  suffix('more.tv', 'streaming-ru'),
  suffix('rutube.ru', 'streaming-ru'),
  suffix('smotrim.ru', 'streaming-ru'),  // ВГТРК
]

export const RU_DIRECT_RULES: readonly RoutingRule[] = [
  ...BANKS,
  ...PAYMENTS,
  ...GOV,
  ...STREAMING_RU,
]
