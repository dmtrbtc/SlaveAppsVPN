import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CabinetLoginCard } from '../components/cabinet/CabinetPanel'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Link2, Shield, CheckCircle, AlertCircle, Server,
  Zap, User, Check, ArrowRight,
} from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { useAuthStore } from '../stores/auth.store'
import { useConfigSourceStore } from '../stores/config-source.store'
import { TitleBar } from '../components/layout/TitleBar'
import type { ConfigSourceValidateResult } from '@shared/ipc/types'

type OnboardingTab = 'provider' | 'subscription-url' | 'single-proxy'

// Aurora v1.1 onboarding — radio MethodCards (left column) instead of segmented.
// Аккаунт SLAVE first (the recommended path — email/Telegram → auto-import).
const METHODS: {
  id: OnboardingTab
  icon: React.ReactNode
  title: string
  sub: string
  recommended?: boolean
}[] = [
  { id: 'provider',         icon: <User className="h-4 w-4" />,  title: 'Аккаунт SLAVE', sub: 'вход по email или Telegram', recommended: true },
  { id: 'subscription-url', icon: <Link2 className="h-4 w-4" />, title: 'Подписка-URL', sub: 'https-ссылка, авто-обновление нод' },
  { id: 'single-proxy',     icon: <Zap className="h-4 w-4" />,   title: 'Одиночная ссылка', sub: 'vless:// · vmess:// · trojan://' },
]

const METHOD_TITLE: Record<OnboardingTab, string> = {
  'provider': 'Вход в аккаунт SLAVE',
  'subscription-url': 'Подписка-URL',
  'single-proxy': 'Одиночная ссылка',
}

function MethodCard({
  icon, title, sub, recommended, active, onSelect,
}: {
  icon: React.ReactNode; title: string; sub: string; recommended?: boolean
  active: boolean; onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all',
        active ? 'border-accent bg-accent/12' : 'border-border bg-bg-primary hover:border-border-strong',
      )}
    >
      <span className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors',
        active ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary',
      )}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold text-text-primary">{title}</span>
          {recommended && <Badge tone="accent" className="text-[9px]">Рекомендуем</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-text-muted">{sub}</span>
      </span>
      <span className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        active ? 'border-accent bg-accent' : 'border-border-strong',
      )}>
        {active && <Check className="h-2.5 w-2.5 text-white" />}
      </span>
    </button>
  )
}

const PROTOCOL_TONE: Record<string, 'ok' | 'warn' | 'neutral'> = {
  reality: 'ok',
  'vless+tls': 'ok',
  'trojan+tls': 'ok',
  ws: 'warn',
  grpc: 'warn',
}

function ValidationBadge({ result }: { result: ConfigSourceValidateResult }) {
  if (result.valid) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-connected">
        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{result.displayName ?? 'Подключение найдено'}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-error">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{result.error ?? 'Неверный формат'}</span>
    </div>
  )
}

function NodePreviewPanel({ result }: { result: ConfigSourceValidateResult }) {
  if (!result.valid || !result.nodeCount) return null
  const protocols = result.protocols ?? {}
  const protocolEntries = Object.entries(protocols).sort((a, b) => b[1] - a[1])

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-lg border border-border/60 bg-bg-secondary/50 p-3 flex flex-col gap-2"
    >
      {/* Protocol breakdown */}
      {protocolEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {protocolEntries.map(([proto, count]) => (
            <Badge key={proto} tone={PROTOCOL_TONE[proto] ?? 'neutral'}>
              {proto.toUpperCase()} · {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Sample nodes */}
      {result.sampleNodes && result.sampleNodes.length > 0 && (
        <div className="space-y-1">
          {result.sampleNodes.slice(0, 3).map((node, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-text-muted font-mono truncate">
              <Server className="h-2.5 w-2.5 shrink-0 text-text-muted/60" />
              <span className="truncate">{node.name}</span>
            </div>
          ))}
          {result.nodeCount > 3 && (
            <p className="text-[10px] text-text-muted pl-4">
              + ещё {result.nodeCount - 3}
            </p>
          )}
        </div>
      )}
    </motion.div>
  )
}

function SubscriptionUrlTab({ onSuccess }: { onSuccess: () => void }) {
  const [url, setUrl] = useState('')
  const { phase, error, validationResult, validate, save, resetValidation } = useConfigSourceStore()
  const { setConfigSourceMeta } = useAuthStore()

  const isValidating = phase === 'validating'
  const isSaving = phase === 'saving'
  const busy = isValidating || isSaving

  const handleValidate = async () => {
    if (!url.trim()) return
    await validate('subscription-url', url.trim())
  }

  const handleSave = async () => {
    try {
      const meta = await save('subscription-url', url.trim())
      setConfigSourceMeta(meta)
      onSuccess()
    } catch {
      // error shown via store
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-secondary leading-relaxed">
        Вставьте ссылку на Clash/YAML-подписку. Конфигурация загружается при каждом подключении.
      </p>
      <Input
        label="URL подписки"
        placeholder="https://example.com/sub/..."
        value={url}
        onChange={e => { setUrl(e.target.value); if (validationResult) resetValidation() }}
        icon={<Link2 className="h-3.5 w-3.5" />}
        disabled={busy}
      />
      {validationResult && <ValidationBadge result={validationResult} />}
      {validationResult && <NodePreviewPanel result={validationResult} />}
      {error && phase === 'error' && (
        <div className="flex items-center gap-1.5 text-[12px] text-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={() => void handleValidate()}
          loading={isValidating}
          disabled={busy || !url.trim()}
        >
          Проверить
        </Button>
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          onClick={() => void handleSave()}
          loading={isSaving}
          disabled={busy || !url.trim()}
        >
          Подключить
        </Button>
      </div>
    </div>
  )
}

function SingleProxyTab({ onSuccess }: { onSuccess: () => void }) {
  const [link, setLink] = useState('')
  const { phase, error, validationResult, validate, save, resetValidation } = useConfigSourceStore()
  const { setConfigSourceMeta } = useAuthStore()

  const isValidating = phase === 'validating'
  const isSaving = phase === 'saving'
  const busy = isValidating || isSaving

  const handleValidate = async () => {
    if (!link.trim()) return
    await validate('single-proxy', link.trim())
  }

  const handleSave = async () => {
    try {
      const meta = await save('single-proxy', link.trim())
      setConfigSourceMeta(meta)
      onSuccess()
    } catch {
      // error shown via store
    }
  }

  const SUPPORTED = 'vless:// · vmess:// · trojan:// · ss:// · hysteria2:// · tuic://'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-secondary leading-relaxed">
        Вставьте одну прокси-ссылку. Поддерживаются:
      </p>
      <p className="text-[11px] text-text-muted font-mono leading-relaxed">{SUPPORTED}</p>
      <Input
        label="Прокси-ссылка"
        placeholder="vless://uuid@host:port?..."
        value={link}
        onChange={e => { setLink(e.target.value); if (validationResult) resetValidation() }}
        icon={<Link2 className="h-3.5 w-3.5" />}
        disabled={busy}
      />
      {validationResult && <ValidationBadge result={validationResult} />}
      {validationResult && <NodePreviewPanel result={validationResult} />}
      {error && phase === 'error' && (
        <div className="flex items-center gap-1.5 text-[12px] text-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={() => void handleValidate()}
          loading={isValidating}
          disabled={busy || !link.trim()}
        >
          Проверить
        </Button>
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          onClick={() => void handleSave()}
          loading={isSaving}
          disabled={busy || !link.trim()}
        >
          Подключить
        </Button>
      </div>
    </div>
  )
}


export function OnboardingPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<OnboardingTab>('provider')
  const { resetValidation } = useConfigSourceStore()
  const hasAccess = useAuthStore(s => s.hasAccess)

  // Cabinet login (provider tab) grants access via auto-import; forward into the
  // app once that happens.
  useEffect(() => {
    if (hasAccess) navigate('/dashboard', { replace: true })
  }, [hasAccess, navigate])

  const handleTabChange = useCallback((next: OnboardingTab) => {
    resetValidation()
    setTab(next)
  }, [resetValidation])

  const handleSuccess = () => {
    void navigate('/dashboard')
  }

  const handleSkip = () => {
    void navigate('/dashboard')
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg-base">
      <TitleBar />

      {/* Decorative blobs */}
      <div
        className="pointer-events-none absolute -top-20 -left-20 h-80 w-80 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,122,89,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(91,141,239,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }}
      />

      {/* Split layout: methods (left) · selected method content (right) */}
      <div className="relative flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">

        {/* Left column — brand + method picker */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="flex shrink-0 flex-col justify-center gap-5 px-6 py-6 md:w-[420px] md:px-8"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #ff7a59 0%, #5b8def 100%)',
                boxShadow: '0 8px 24px rgba(255,122,89,0.35)',
              }}
            >
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">Шаг 1 из 2</p>
              <h1 className="text-[18px] font-bold tracking-tight text-text-primary">SLAVE VPN</h1>
            </div>
          </div>

          <h2 className="text-[22px] font-bold leading-tight tracking-tight text-text-primary">
            Откуда взять серверы?
          </h2>

          <div className="flex flex-col gap-2">
            {METHODS.map(m => (
              <MethodCard
                key={m.id}
                icon={m.icon}
                title={m.title}
                sub={m.sub}
                recommended={!!m.recommended}
                active={tab === m.id}
                onSelect={() => handleTabChange(m.id)}
              />
            ))}
          </div>
        </motion.div>

        {/* Right column — selected method content */}
        <div className="flex flex-1 flex-col justify-center border-t border-border bg-bg-primary/60 px-6 py-6 md:overflow-y-auto md:border-l md:border-t-0 md:px-10">
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="mx-auto flex w-full max-w-[440px] flex-col gap-4"
          >
            <h3 className="text-[15px] font-semibold text-text-primary">{METHOD_TITLE[tab]}</h3>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {tab === 'provider'         && <CabinetLoginCard />}
                {tab === 'subscription-url' && <SubscriptionUrlTab onSuccess={handleSuccess} />}
                {tab === 'single-proxy'     && <SingleProxyTab onSuccess={handleSuccess} />}
              </motion.div>
            </AnimatePresence>

            <div className="mt-1 flex items-center gap-4">
              <button
                type="button"
                onClick={handleSkip}
                className="inline-flex items-center gap-1 text-[12px] text-text-muted transition-colors hover:text-text-secondary"
              >
                Пропустить
                <ArrowRight className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => void navigate('/cabinet-login')}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-accent transition-colors hover:opacity-80"
              >
                Войти в личный кабинет
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
