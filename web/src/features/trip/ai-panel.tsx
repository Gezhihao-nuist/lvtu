import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Link2, Loader2, Sparkles, X } from 'lucide-react'
import { postSSE } from '../../lib/sse'
import { api } from '../../lib/api'
import type { TripDetail } from '../../types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { toast } from '../../components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

type Phase = 'idle' | 'running' | 'done' | 'error'
type Mode = 'generate' | 'import'

interface AiPanelProps {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

export function AiPanel({ open, onClose, trip }: AiPanelProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('generate')
  const [preferences, setPreferences] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [fetching, setFetching] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [logs, setLogs] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const logBoxRef = useRef<HTMLDivElement>(null)

  const hasItems = trip.days.some((d) => d.items.length > 0)

  // 进度区自动滚到底
  useEffect(() => {
    const box = logBoxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [logs])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])

  // 卸载兜底:组件销毁时中断仍在进行的 SSE
  useEffect(() => () => abortRef.current?.abort(), [])

  /**
   * 关闭面板必须中断 SSE:否则后端会继续烧模型 token,
   * 并在用户不知情时 applyPlan 整表覆盖行程
   */
  const handleClose = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setPhase((p) => (p === 'running' ? 'idle' : p))
    onClose()
  }

  const run = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('running')
    setLogs([])
    setErrorMsg('')
    const path =
      mode === 'generate'
        ? `/ai/trips/${trip.id}/generate`
        : `/ai/trips/${trip.id}/import`
    const body =
      mode === 'generate'
        ? preferences.trim()
          ? { preferences: preferences.trim() }
          : {}
        : { content: importText.trim() }
    try {
      await postSSE(path, body, (event) => {
        if (event.type === 'progress') {
          setLogs((prev) => [...prev, event.text])
        } else if (event.type === 'done') {
          setPhase('done')
          toast.success(`行程已生成:${event.dayCount} 天 · ${event.itemCount} 个安排`)
          void queryClient.invalidateQueries({ queryKey: ['trip', trip.id] })
        } else if (event.type === 'error') {
          setPhase('error')
          setErrorMsg(event.message || '生成失败,请稍后再试')
        }
      }, controller.signal)
      // 流正常结束但未收到 done:兜底刷新一次
      setPhase((p) => {
        if (p === 'running') {
          void queryClient.invalidateQueries({ queryKey: ['trip', trip.id] })
          return 'done'
        }
        return p
      })
    } catch (err) {
      if (controller.signal.aborted) return
      setPhase('error')
      setErrorMsg(err instanceof Error && err.message ? err.message : '生成失败,请检查网络后重试')
    }
  }

  /** 抓取攻略链接正文预填;反爬站点失败时提示改为手动粘贴 */
  const handleFetchUrl = async () => {
    const url = importUrl.trim()
    if (!url) return
    setFetching(true)
    try {
      const r = await api<{ title: string | null; text: string }>('/ai/fetch-url', {
        method: 'POST',
        body: JSON.stringify({ url }),
      })
      setImportText(r.text)
      toast.success(r.title ? `已抓取:${r.title}` : '抓取成功,请核对正文')
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : '抓取失败,请直接粘贴攻略文字')
    } finally {
      setFetching(false)
    }
  }

  const canRun =
    phase !== 'running' &&
    (mode === 'generate' || importText.trim().length >= 20)

  const handleGenerateClick = () => {
    if (hasItems) setConfirmOpen(true)
    else void run()
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-zinc-950/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleClose}
            />
            <motion.aside
              role="dialog"
              aria-label="AI 规划"
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-overlay"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between border-b border-zinc-200/70 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-accent-600 text-white">
                    <Sparkles className="size-4" />
                  </span>
                  <h2 className="text-base font-semibold tracking-tight">AI 规划</h2>
                </div>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={handleClose}
                  className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {/* 模式切换:AI 生成 / 攻略导入 */}
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1" role="tablist">
                  {(
                    [
                      { key: 'generate', label: 'AI 生成' },
                      { key: 'import', label: '导入攻略' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      role="tab"
                      aria-selected={mode === m.key}
                      onClick={() => setMode(m.key)}
                      className={`rounded-lg py-1.5 text-sm font-medium transition-all ${
                        mode === m.key
                          ? 'bg-white text-zinc-900 shadow-card'
                          : 'text-zinc-500 hover:text-zinc-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {mode === 'generate' ? (
                  <>
                    <p className="mt-4 text-sm leading-relaxed text-zinc-500">
                      告诉我你的偏好,AI 会按天排出景点、美食与住宿,并自动标到地图上。
                    </p>
                    <div className="mt-4 space-y-1.5">
                      <label htmlFor="ai-preferences" className="text-sm font-medium text-zinc-700">
                        旅行偏好 <span className="font-normal text-zinc-400">可选</span>
                      </label>
                      <Textarea
                        id="ai-preferences"
                        rows={4}
                        placeholder="如:喜欢自然风光、预算有限、带老人小孩…"
                        value={preferences}
                        onChange={(e) => setPreferences(e.target.value)}
                        disabled={phase === 'running'}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-4 text-sm leading-relaxed text-zinc-500">
                      粘贴小红书/马蜂窝等攻略文字,或先试链接抓取,AI 会把攻略里的地点提炼成行程。
                    </p>
                    <div className="mt-4 space-y-1.5">
                      <label htmlFor="import-url" className="text-sm font-medium text-zinc-700">
                        攻略链接 <span className="font-normal text-zinc-400">可选,抓取失败就粘文字</span>
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="import-url"
                          type="url"
                          placeholder="https://…"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          disabled={phase === 'running' || fetching}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleFetchUrl()}
                          disabled={!importUrl.trim() || fetching || phase === 'running'}
                        >
                          {fetching ? <Loader2 className="animate-spin" /> : <Link2 />}
                          抓取
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <label htmlFor="import-text" className="text-sm font-medium text-zinc-700">
                        攻略正文
                      </label>
                      <Textarea
                        id="import-text"
                        rows={8}
                        placeholder="把攻略全文粘贴到这里(至少 20 字)…"
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        disabled={phase === 'running'}
                      />
                      {importText.trim().length > 0 && importText.trim().length < 20 && (
                        <p className="text-xs text-amber-600">再写一点,至少 20 字才能提炼</p>
                      )}
                    </div>
                  </>
                )}

                {/* 生成进度 */}
                {phase !== 'idle' && (
                  <div className="mt-5">
                    <p className="mb-2 text-sm font-medium text-zinc-700">
                      {phase === 'running'
                        ? '正在规划…'
                        : phase === 'done'
                          ? '规划完成'
                          : '出了点问题'}
                    </p>
                    <div
                      ref={logBoxRef}
                      className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-zinc-50 p-4"
                      aria-live="polite"
                    >
                      {logs.map((text, i) => (
                        <motion.p
                          key={i}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-start gap-2 text-sm text-zinc-600"
                        >
                          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-accent-500" />
                          {text}
                        </motion.p>
                      ))}
                      {phase === 'running' && (
                        <p className="flex items-center gap-2 text-sm text-zinc-400">
                          <span className="size-3 animate-spin rounded-full border-2 border-zinc-200 border-t-accent-600" />
                          AI 思考中…
                        </p>
                      )}
                      {phase === 'done' && (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-accent-700">
                          <CircleCheck className="size-4" />
                          行程已更新到左侧时间轴
                        </p>
                      )}
                      {phase === 'error' && (
                        <div className="flex items-start gap-2 text-sm text-red-600">
                          <CircleAlert className="mt-0.5 size-4 shrink-0" />
                          <span>
                            {errorMsg}
                            <button
                              type="button"
                              onClick={() => void run()}
                              className="ml-2 font-medium underline underline-offset-2 hover:text-red-700"
                            >
                              重试
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-200/70 px-6 py-4">
                <Button
                  className="w-full"
                  size="lg"
                  loading={phase === 'running'}
                  disabled={!canRun && phase !== 'running'}
                  onClick={handleGenerateClick}
                >
                  {phase === 'running'
                    ? '规划进行中…'
                    : mode === 'import'
                      ? hasItems
                        ? '导入并覆盖行程'
                        : '导入并规划'
                      : hasItems
                        ? '重新生成行程'
                        : '生成行程'}
                </Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 覆盖确认 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{mode === 'import' ? '导入并覆盖行程?' : '重新生成行程?'}</DialogTitle>
            <DialogDescription>
              当前的日程安排将被{mode === 'import' ? '攻略提炼出的新行程' : ' AI 生成的新行程'}覆盖,此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false)
                void run()
              }}
            >
              继续{mode === 'import' ? '导入' : '生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
