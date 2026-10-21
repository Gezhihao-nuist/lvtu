import { create } from 'zustand'
import type { User } from '../types'

export type AuthStatus = 'idle' | 'authed' | 'guest'

interface AuthState {
  user: User | null
  accessToken: string | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, nickname: string) => Promise<void>
  logout: () => Promise<void>
  /** 应用启动时用 httpOnly cookie 换一次新 token */
  restoreSession: () => Promise<void>
  /** 静默刷新,供 api 层 401 时调用;成功返回 true */
  refresh: () => Promise<boolean>
  clearSession: () => void
}

interface AuthPayload {
  user: User
  accessToken: string
}

/**
 * 进行中的刷新请求(模块级单例)。
 * refresh token 是轮换制的:并发 401 若各自发起刷新,
 * 第二个请求会用已作废的旧 token 而被拒,导致误把用户踢下线。
 * 所有并发调用共享同一个 promise,保证只有一次真实刷新。
 */
let refreshPromise: Promise<boolean> | null = null

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json()
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message: unknown }).message
      if (typeof msg === 'string') return msg
      if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0]
    }
  } catch {
    /* ignore */
  }
  return `请求失败(${res.status})`
}

async function authRequest(path: string, body: Record<string, string>): Promise<AuthPayload> {
  const res = await fetch(`/api/v1/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as AuthPayload
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  status: 'idle',

  async login(email, password) {
    const { user, accessToken } = await authRequest('/login', { email, password })
    set({ user, accessToken, status: 'authed' })
  },

  async register(email, password, nickname) {
    const { user, accessToken } = await authRequest('/register', { email, password, nickname })
    set({ user, accessToken, status: 'authed' })
  },

  async logout() {
    const token = get().accessToken
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
    } catch {
      /* 网络失败也照常清空本地态 */
    }
    set({ user: null, accessToken: null, status: 'guest' })
  },

  async restoreSession() {
    const ok = await get().refresh()
    if (!ok) {
      set({ user: null, accessToken: null, status: 'guest' })
      return
    }
    try {
      const res = await fetch('/api/v1/auth/me', {
        credentials: 'include',
        headers: { Authorization: `Bearer ${get().accessToken}` },
      })
      if (!res.ok) throw new Error()
      const user = (await res.json()) as User
      set({ user, status: 'authed' })
    } catch {
      set({ user: null, accessToken: null, status: 'guest' })
    }
  },

  async refresh() {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const res = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          })
          if (!res.ok) return false
          const data = (await res.json()) as { accessToken: string }
          set({ accessToken: data.accessToken })
          return true
        } catch {
          return false
        }
      })().finally(() => {
        refreshPromise = null
      })
    }
    return refreshPromise
  },

  clearSession() {
    set({ user: null, accessToken: null, status: 'guest' })
  },
}))
