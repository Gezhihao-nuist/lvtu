import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPinned } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { AuthLayout } from './auth-layout'

export default function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/trips'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  if (status === 'authed') return <Navigate to={from} replace />

  const handleSubmit = async () => {
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入正确的邮箱地址')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    setPending(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : '登录失败,请检查邮箱和密码')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        {/* 小屏品牌头(大屏由左侧面板承载) */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-600 text-white lg:hidden">
            <MapPinned className="size-5.5" />
          </span>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">欢迎回来</h1>
            <p className="mt-1 text-sm text-zinc-500">登录旅图,继续你的旅行计划</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-card"
          noValidate
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium text-zinc-700">
                邮箱
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-medium text-zinc-700">
                密码
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="mt-5 w-full" loading={pending}>
            {pending ? '登录中…' : '登录'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          还没有账号?{' '}
          <Link to="/register" className="font-medium text-accent-600 hover:text-accent-700">
            注册一个
          </Link>
        </p>
      </motion.div>
    </AuthLayout>
  )
}
