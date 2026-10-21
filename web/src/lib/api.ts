import { useAuthStore } from '../stores/auth'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
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

function buildInit(init: RequestInit): RequestInit {
  const token = useAuthStore.getState().accessToken
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return { ...init, headers, credentials: 'include' }
}

/**
 * 带鉴权的 fetch:401 时先静默刷新 token 重试一次;
 * 仍失败则清空登录态(RequireAuth 会接管跳转 /login)。
 * 返回原始 Response,供 JSON api 与 SSE 流复用。
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `/api/v1${path}`
  let res = await fetch(url, buildInit(init))
  if (res.status === 401) {
    const ok = await useAuthStore.getState().refresh()
    if (ok) {
      res = await fetch(url, buildInit(init))
    }
    if (res.status === 401) {
      useAuthStore.getState().clearSession()
      throw new ApiError(401, '登录已过期,请重新登录')
    }
  }
  if (!res.ok) throw new ApiError(res.status, await parseErrorMessage(res))
  return res
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
