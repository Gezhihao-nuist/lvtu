import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { postSSE } from '../../lib/sse'
import { toast } from '../../components/ui/toast'

interface DayAiGenerateProps {
  tripId: string
  dayId: string
  /** 用于成功提示文案(Day N) */
  dayIndex: number
}

type Phase = 'idle' | 'running' | 'error'

/** 空天「AI 规划这一天」:SSE 单天生成,进度就地展示,完成刷新行程 */
export function DayAiGenerate({ tripId, dayId, dayIndex }: DayAiGenerateProps) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')
  const [log, setLog] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // 组件卸载(切天/关页面)时中断仍在进行的 SSE
  useEffect(() => () => abortRef.current?.abort(), [])

  const run = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('running')
    setLog('正在规划…')
    try {
      await postSSE(
        `/ai/days/${dayId}/generate`,
        {},
        (event) => {
          if (event.type === 'progress') {
            setLog(event.text)
          } else if (event.type === 'done') {
            toast.success(`Day ${dayIndex + 1} 已生成 ${event.itemCount} 个安排`)
            void queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
          } else if (event.type === 'error') {
            setPhase('error')
            setLog(event.message || '生成失败,请稍后再试')
          }
        },
        controller.signal,
      )
      // 流正常结束(无论是否收到 done,后端已落库才发 done;保守刷新一次)
      setPhase((p) => {
        if (p === 'running') {
          void queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
          return 'idle'
        }
        return p
      })
    } catch (err) {
      if (controller.signal.aborted) return
      setPhase('error')
      setLog(err instanceof Error && err.message ? err.message : '生成失败,请检查网络后重试')
    }
  }

  if (phase === 'running') {
    return (
      <p className="flex items-center justify-center gap-2 py-1 text-sm text-zinc-500">
        <span className="size-3.5 animate-spin rounded-full border-2 border-zinc-200 border-t-accent-600" />
        {log}
      </p>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void run()}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-accent-600 py-2.5 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-700"
      >
        <Sparkles className="size-4" />
        AI 规划这一天
      </button>
      {phase === 'error' && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {log}
          <button
            type="button"
            onClick={() => void run()}
            className="ml-1.5 font-medium underline underline-offset-2 hover:text-red-700"
          >
            重试
          </button>
        </p>
      )}
    </div>
  )
}
