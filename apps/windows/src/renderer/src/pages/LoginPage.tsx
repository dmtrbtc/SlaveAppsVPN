import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, Send, Shield } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { useAuthStore } from '../stores/auth.store'
import { useUIStore } from '../stores/ui.store'
import { TitleBar } from '../components/layout/TitleBar'

export function LoginPage() {
  const navigate = useNavigate()
  const { loginEmail, loginTelegram } = useAuthStore()
  const { notify } = useUIStore()

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
      notify({ type: 'error', title: 'Ошибка входа', message: msg })
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
    <div className="flex h-full flex-col bg-bg-base">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-[340px] px-6"
        >
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 border border-accent/25">
              <Shield className="h-7 w-7 text-accent" />
              <div className="absolute -inset-0.5 rounded-2xl bg-accent/10 blur-md -z-10" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight text-text-primary">SLAVE VPN</h1>
              <p className="text-xs text-text-muted mt-0.5">Universal VPN Platform</p>
            </div>
          </div>

          {/* Telegram */}
          <Button
            variant="outline"
            size="lg"
            className="w-full border-[#2196F3]/30 bg-[#2196F3]/10 text-[#64B5F6] hover:bg-[#2196F3]/20 hover:border-[#2196F3]/40 mb-4"
            onClick={handleTelegramLogin}
            disabled={isTgLoading}
          >
            <Send className="h-4 w-4" />
            Войти через Telegram
          </Button>

          <div className="relative mb-4">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-base px-2 text-xs text-text-muted">
              или
            </span>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
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
              size="lg"
              className="w-full mt-1"
              disabled={isEmailLoading || !email || !password}
            >
              {isEmailLoading ? 'Вход...' : 'Войти'}
            </Button>
          </form>

          <p className="mt-6 text-center text-[11px] text-text-muted leading-relaxed">
            Нет аккаунта?{' '}
            <a
              className="text-text-accent hover:underline cursor-pointer"
              onClick={() => notify({ type: 'info', title: 'Регистрация', message: 'Перейдите на сайт провайдера' })}
            >
              Зарегистрироваться
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
