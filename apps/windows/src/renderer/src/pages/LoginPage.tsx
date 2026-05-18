import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Send, Shield } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Segmented } from '../components/ui/segmented'
import { useAuthStore } from '../stores/auth.store'
import { useUIStore } from '../stores/ui.store'
import { TitleBar } from '../components/layout/TitleBar'

type AuthTab = 'email' | 'telegram'

const TAB_OPTIONS: { value: AuthTab; label: string }[] = [
  { value: 'email',    label: 'Email' },
  { value: 'telegram', label: 'Telegram' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const { loginEmail } = useAuthStore()
  const { notify } = useUIStore()

  const [tab, setTab] = useState<AuthTab>('email')
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
      void navigate('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка авторизации'
      setEmailError(msg)
    } finally {
      setIsEmailLoading(false)
    }
  }

  const handleTelegramLogin = async () => {
    setIsTgLoading(true)
    try {
      notify({ type: 'info', title: 'Telegram', message: 'Функция в разработке' })
    } finally {
      setIsTgLoading(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-bg-base overflow-hidden">
      <TitleBar />

      {/* Decorative blobs */}
      <div
        className="pointer-events-none absolute -top-20 -left-20 h-80 w-80 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,122,89,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(91,141,239,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Centered content */}
      <div className="flex flex-1 items-center justify-center">
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
              <p className="text-[13px] text-text-muted mt-0.5">Личный пропуск в открытый интернет</p>
            </div>
          </div>

          {/* Auth card */}
          <div className="w-full rounded-lg border border-border bg-bg-primary p-5 shadow-card flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex justify-center">
              <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} size="md" />
            </div>

            {/* Email form */}
            {tab === 'email' && (
              <motion.form
                key="email"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
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

            {/* Telegram */}
            {tab === 'telegram' && (
              <motion.div
                key="telegram"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-3"
              >
                <p className="text-[13px] text-text-secondary text-center leading-relaxed">
                  Нажмите кнопку ниже и подтвердите вход в Telegram-боте
                </p>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => void handleTelegramLogin()}
                  loading={isTgLoading}
                  style={{ background: '#2196F3', borderColor: '#2196F3' }}
                >
                  <Send className="h-4 w-4" />
                  {isTgLoading ? 'Ожидаем подтверждение...' : 'Открыть Telegram'}
                </Button>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <p className="text-[11px] text-text-muted text-center">
            Нет аккаунта?{' '}
            <button
              className="text-accent hover:underline"
              onClick={() => notify({ type: 'info', title: 'Регистрация', message: 'Перейдите на сайт провайдера' })}
            >
              Зарегистрироваться
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
