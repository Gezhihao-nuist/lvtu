import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Sparkles, X } from 'lucide-react'
import { postSSE } from '../../lib/sse'
import type { TripDetail } from '../../types'
import { Button } from '../../components/ui/button'
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

interface AiPanelProps {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

export function AiPanel({ open, onClose, trip }: AiPanelProps) {
  const queryClient = useQueryClient()
  const [preferences, setPreferences] = useState('')
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
    try {
      await postSSE(
        `/ai/trips/${trip.id}/generate`,
        preferences.trim() ? { preferences: preferences.trim() } : {},
        (event) => {
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
        },
        controller.signal,
      )
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
                <p className="text-sm leading-relaxed text-zinc-500">
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
                  onClick={handleGenerateClick}
                >
                  {phase === 'running'
                    ? '规划进行中…'
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
            <DialogTitle>重新生成行程?</DialogTitle>
            <DialogDescription>
              当前的日程安排将被 AI 生成的新行程覆盖,此操作不可撤销。
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
              继续生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
