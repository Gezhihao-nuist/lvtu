import { useQuery } from '@tanstack/react-query'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import type { HealthReport, TripDetail } from '../../types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Spinner } from '../../components/ui/spinner'

const GRADE_STYLE: Record<HealthReport['grade'], string> = {
  A: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  B: 'bg-amber-50 text-amber-600 border-amber-200',
  C: 'bg-orange-50 text-orange-600 border-orange-200',
  D: 'bg-red-50 text-red-600 border-red-200',
}

const PACE_LABEL: Record<string, { label: string; className: string }> = {
  tight: { label: '偏满', className: 'bg-orange-50 text-orange-600' },
  ok: { label: '适中', className: 'bg-emerald-50 text-emerald-600' },
  loose: { label: '较空', className: 'bg-sky-50 text-sky-600' },
  empty: { label: '未安排', className: 'bg-zinc-100 text-zinc-500' },
}

interface HealthDialogProps {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

export function HealthDialog({ open, onClose, trip }: HealthDialogProps) {
  const healthQuery = useQuery({
    queryKey: ['health', trip.id],
    queryFn: () => api<HealthReport>(`/trips/${trip.id}/health`),
    enabled: open,
  })

  const data = healthQuery.data
  const hours = (m: number) => `${(m / 60).toFixed(1)}h`

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>行程体检</DialogTitle>
          <DialogDescription>
            按里程、折返、节奏与天气匹配做确定性检查,不调 AI,即时出结果
          </DialogDescription>
        </DialogHeader>

        {healthQuery.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-accent-600" />
          </div>
        ) : healthQuery.isError || !data ? (
          <p className="py-8 text-center text-sm text-zinc-500">体检失败,请稍后再试</p>
        ) : (
          <div className="space-y-5">
            {/* 总分 */}
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  'flex size-16 shrink-0 items-center justify-center rounded-2xl border text-2xl font-bold',
                  GRADE_STYLE[data.grade],
                )}
              >
                {data.grade}
              </span>
              <div>
                <p className="tnum text-2xl font-semibold tracking-tight text-zinc-900">
                  {data.score}
                  <span className="text-sm font-normal text-zinc-400"> / 100</span>
                </p>
                <p className="text-xs text-zinc-500">
                  全程约 <span className="tnum">{data.totalKm}</span> km(含道路绕行估算)
                </p>
              </div>
            </div>

            {/* 每日明细 */}
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
              {data.days.map((d) => (
                <li key={d.dayIndex} className="px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-800">Day {d.dayIndex + 1}</span>
                    <span className="tnum text-xs text-zinc-400">{d.date.slice(5)}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        PACE_LABEL[d.pace]?.className,
                      )}
                    >
                      {PACE_LABEL[d.pace]?.label}
                    </span>
                    <span className="tnum ml-auto text-xs text-zinc-500">
                      {d.totalKm}km · {hours(d.estMinutes)}
                    </span>
                  </div>
                  {d.issues.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {d.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700">
                          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>

            {data.suggestions.length === 0 && (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700">
                <CircleCheck className="size-4 shrink-0" />
                没有发现问题,这份行程很健康
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
