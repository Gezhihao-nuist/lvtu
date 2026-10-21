import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SseEvent } from '../types'
import { postSSE } from './sse'
import { apiFetch } from './api'

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}))

const apiFetchMock = vi.mocked(apiFetch)

/** 按给定 chunk 构造流式 Response */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream)
}

describe('postSSE 流式事件解析', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('完整事件 + 跨 chunk 拆断的事件都能按序解析', async () => {
    apiFetchMock.mockResolvedValue(
      sseResponse([
        'data: {"type":"progress","text":"正在规划…"}\n\ndata: {"type":"pro',
        'gress","text":"生成中…"}\n\ndata: {"type":"done","dayCount":3,"itemCount":12}\n\n',
      ]),
    )
    const events: SseEvent[] = []
    await postSSE('/ai/trips/t1/generate', {}, (e) => events.push(e))
    expect(events).toEqual([
      { type: 'progress', text: '正在规划…' },
      { type: 'progress', text: '生成中…' },
      { type: 'done', dayCount: 3, itemCount: 12 },
    ])
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/ai/trips/t1/generate',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('无 data 行的 chunk 与坏 JSON 行被忽略,不中断后续解析', async () => {
    apiFetchMock.mockResolvedValue(
      sseResponse([
        ': 心跳注释\n\n' +
          'data: {坏 json}\n\n' +
          'data: {"type":"error","message":"余额不足"}\n\n',
      ]),
    )
    const events: SseEvent[] = []
    await postSSE('/ai/trips/t1/generate', {}, (e) => events.push(e))
    expect(events).toEqual([{ type: 'error', message: '余额不足' }])
  })

  it('res.body 为 null(不支持流式):抛明确错误', async () => {
    apiFetchMock.mockResolvedValue(new Response('null 响应体'))
    // node 的 Response 必有 body,构造一个无 body 的假 Response
    apiFetchMock.mockResolvedValue({ body: null } as unknown as Response)
    await expect(postSSE('/x', {}, () => {})).rejects.toThrow(
      '浏览器不支持流式读取',
    )
  })
})
