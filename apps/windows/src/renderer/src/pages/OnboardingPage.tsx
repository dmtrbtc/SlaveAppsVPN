import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Key, Shield, CheckCircle, AlertCircle, Mail, Lock, Send } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Segmented } from '../components/ui/segmented'
import { useAuthStore } from '../stores/auth.store'
import { useConfigSourceStore } from '../stores/config-source.store'
import { useUIStore } from '../stores/ui.store'
import { TitleBar } from '../components/layout/TitleBar'

type OnboardingTab = 'subscription-url' | 'single-proxy' | 'remnawave-key' | 'provider'

const TAB_OPTIONS: { value: OnboardingTab; label: string }[] = [
  { value: 'subscription-url', label: 'Подписка' },
  { value: 'single-proxy',     label: 'Ссылка' },
  { value: 'remnawave-key',    label: 'Ключ' },
  { value: 'provider',         label: 'Аккаунт' },
]

type AuthTab = 'email' | 'telegram'

const AUTH_TAB_OPTIONS: { value: AuthTab; label: string }[] = [
  { value: 'email',    label: 'Email' },
  { value: 'telegram', label: 'Telegram' },
]

function ValidationBadge({ result }: { result: { valid: boolean; error?: string; displayName?: string } }) {
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

function RemnawaveKeyTab({ onSuccess }: { onSuccess: () => void }) {
  const [key, setKey] = useState('')
  const { phase, error, validationResult, validate, save, resetValidation } = useConfigSourceStore()
  const { setConfigSourceMeta } = useAuthStore()

  const isValidating = phase === 'validating'
  const isSaving = phase === 'saving'
  const busy = isValidating || isSaving

  const handleValidate = async () => {
    if (!key.trim()) return
    await validate('remnawave-key', key.trim())
  }

  const handleSave = async () => {
    try {
      const meta = await save('remnawave-key', key.trim())
      setConfigSourceMeta(meta)
      onSuccess()
    } catch {
      // error shown via store
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-text-secondary leading-relaxed">
        Введите ключ доступа Remnawave. Ключ хранится только в зашифрованном хранилище на вашем устройстве.
      </p>
      <Input
        label="Ключ доступа"
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        value={key}
        onChange={e => { setKey(e.target.value); if (validationResult) resetValidation() }}
        icon={<Key className="h-3.5 w-3.5" />}
        disabled={busy}
      />
      {validationResult && <ValidationBadge result={validationResult} />}
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
          disabled={busy || key.trim().length < 8}
        >
          Проверить
        </Button>
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          onClick={() => void handleSave()}
          loading={isSaving}
          disabled={busy || key.trim().length < 8}
        >
          Подключить
        </Button>
      </div>
    </div>
  )
}

function ProviderLoginTab({ onSuccess }: { onSuccess: () => void }) {
  const { loginEmail } = useAuthStore()
  const { notify } = useUIStore()

  const [authTab, setAuthTab] = useState<AuthTab>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [isTgLoading, setIsTgLoading] = useState(false)
  const [emailError, setEmailError] = useState('')

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setEmailError('')
    setIsEmailLoading(true)
    try {
      await loginEmail(email, password)
      onSuccess()
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Ошибка авторизации')
    } finally {
      setIsEmailLoading(false)
    }
  }

  const handleTgLogin = async () => {
    setIsTgLoading(true)
    try {
      notify({ type: 'info', title: 'Telegram', message: 'Функция в разработке' })
    } finally {
      setIsTgLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <Segmented options={AUTH_TAB_OPTIONS} value={authTab} onChange={setAuthTab} size="sm" />
      </div>

      <AnimatePresence mode="wait">
        {authTab === 'email' && (
          <motion.form
            key="email"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.15 }}
            onSubmit={handleEmailLogin}
            className="flex flex-col gap-3"
          >
            <Input
              type="email"
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              icon={<Mail className="h-3.5 w-3.5" />}
              autoComplete="email"
              disabled={isEmailLoading}
            />
            <Input
              type="password"
              label="Пароль"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              error={emailError}
              icon={<Lock className="h-3.5 w-3.5" />}
              autoComplete="current-password"
              disabled={isEmailLoading}
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-1"
              loading={isEmailLoading}
              disabled={isEmailLoading || !email || !password}
            >
              {isEmailLoading ? 'Входим...' : 'Войти'}
            </Button>
          </motion.form>
        )}

        {authTab === 'telegram' && (
          <motion.div
            key="telegram"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-3"
          >
            <p className="text-[13px] text-text-secondary text-center leading-relaxed">
              Нажмите кнопку ниже и подтвердите вход в Telegram-боте
            </p>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void handleTgLogin()}
              loading={isTgLoading}
              style={{ background: '#2196F3', borderColor: '#2196F3' }}
            >
              <Send className="h-4 w-4" />
              {isTgLoading ? 'Ожидаем подтверждение...' : 'Открыть Telegram'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<OnboardingTab>('subscription-url')
  const { resetValidation } = useConfigSourceStore()

  const handleTabChange = useCallback((next: OnboardingTab) => {
    resetValidation()
    setTab(next)
  }, [resetValidation])

  const handleSuccess = () => {
    void navigate('/dashboard')
  }

  return (
    <div className="relative flex h-full flex-col bg-bg-base overflow-hidden">
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

      <div className="flex flex-1 items-center justify-center overflow-y-auto py-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-[380px] px-6 flex flex-col items-center gap-6"
        >
          {/* Brand block */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #ff7a59 0%, #5b8def 100%)',
                boxShadow: '0 8px 24px rgba(255,122,89,0.35)',
              }}
            >
              <Shield className="h-7 w-7 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-[22px] font-bold tracking-tight text-text-primary leading-tight">
                SLAVE VPN
              </h1>
              <p className="text-[13px] text-text-muted mt-0.5">Выберите способ подключения</p>
            </div>
          </div>

          {/* Mode card */}
          <div className="w-full rounded-lg border border-border bg-bg-primary p-5 shadow-card flex flex-col gap-4">
            <div className="flex justify-center">
              <Segmented options={TAB_OPTIONS} value={tab} onChange={handleTabChange} size="sm" />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {tab === 'subscription-url' && <SubscriptionUrlTab onSuccess={handleSuccess} />}
                {tab === 'single-proxy'     && <SingleProxyTab onSuccess={handleSuccess} />}
                {tab === 'remnawave-key'    && <RemnawaveKeyTab onSuccess={handleSuccess} />}
                {tab === 'provider'         && <ProviderLoginTab onSuccess={handleSuccess} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="text-center text-[11px] text-text-muted pb-2">
            SLAVE VPN · Engine-neutral platform
          </p>
        </motion.div>
      </div>
    </div>
  )
}
