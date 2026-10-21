import { apiFetch } from './api'
import type { SseEvent } from '../types'

/**
 * POST 型 SSE:EventSource 只支持 GET,这里用 fetch + ReadableStream 手动解析。
 * 协议:每段以 \n\n 分隔,取其中 data: 行 JSON.parse。
 */
export async function postSSE(
  path: string,
  body: Record<string, unknown>,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  })
  if (!res.body) throw new Error('浏览器不支持流式读取')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatch = (chunk: string) => {
    const dataLine = chunk
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('data:'))
    if (!dataLine) return
    try {
      onEvent(JSON.parse(dataLine.slice(5).trim()) as SseEvent)
    } catch {
      /* 忽略无法解析的行 */
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) dispatch(part)
  }
  buffer += decoder.decode()
  if (buffer.trim()) dispatch(buffer)
}
