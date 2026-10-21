import { Link, useNavigate } from 'react-router-dom'
import { LogOut, MapPinned } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { toast } from '../ui/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

export function Logo({ href = '/trips' }: { href?: string }) {
  return (
    <Link to={href} className="flex items-center gap-2 rounded-lg" aria-label="旅图首页">
      <span className="flex size-8 items-center justify-center rounded-xl bg-accent-600 text-white">
        <MapPinned className="size-4.5" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-zinc-900">旅图</span>
    </Link>
  )
}

export function UserMenu() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  if (!user) return null

  const initial = (user.nickname || user.email).slice(0, 1).toUpperCase()

  const handleLogout = async () => {
    await logout()
    toast.info('已退出登录')
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="用户菜单"
          className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-opacity hover:opacity-85"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-zinc-900">{user.nickname}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleLogout} className="text-red-600 [&_svg]:text-red-500">
          <LogOut />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppHeader() {
  return (
    <header className="material-chrome sticky top-0 z-40">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Logo />
        <UserMenu />
      </div>
    </header>
  )
}
