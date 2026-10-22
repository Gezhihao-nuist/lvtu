import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatMoney } from '../../lib/format'
import { cn } from '../../lib/utils'
import type { BudgetSummary, ItemType, TripDetail } from '../../types'
import { ITEM_TYPE_META } from './item-meta'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast'

const TYPE_ORDER: ItemType[] = ['SPOT', 'FOOD', 'HOTEL', 'TRANSPORT']

interface BudgetDialogProps {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

export function BudgetDialog({ open, onClose, trip }: BudgetDialogProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null)

  const budgetQuery = useQuery({
    queryKey: ['budget', trip.id],
    queryFn: () => api<BudgetSummary>(`/trips/${trip.id}/budget`),
    enabled: open,
  })

  const saveBudget = useMutation({
    mutationFn: (budgetTotal: number) =>
      api(`/trips/${trip.id}`, { method: 'PATCH', body: JSON.stringify({ budgetTotal }) }),
    onSuccess: () => {
      toast.success('预算已更新')
      void queryClient.invalidateQueries({ queryKey: ['budget', trip.id] })
      void queryClient.invalidateQueries({ queryKey: ['trip', trip.id] })
    },
    onError: () => toast.error('预算保存失败,请稍后再试'),
  })

  const commitDraft = () => {
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (!Number.isFinite(n) || n < 0 || draft.trim() === '') return
    if (n !== budgetQuery.data?.budgetTotal) saveBudget.mutate(n)
  }

  const data = budgetQuery.data
  const remaining = data?.budgetTotal != null ? data.budgetTotal - data.plannedTotal : null
  const pct =
    data?.budgetTotal != null && data.budgetTotal > 0
      ? Math.min(100, Math.round((data.plannedTotal / data.budgetTotal) * 100))
      : null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>预算与花费</DialogTitle>
          <DialogDescription>
            花费来自每个条目的「预计花费」,改条目后自动重新汇总
          </DialogDescription>
        </DialogHeader>

        {budgetQuery.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-6 text-accent-600" />
          </div>
        ) : budgetQuery.isError || !data ? (
          <p className="py-8 text-center text-sm text-zinc-500">预算数据加载失败,请稍后再试</p>
        ) : (
          <div className="space-y-5">
            {/* 总预算 + 预计花费 */}
            <div className="flex items-end justify-between gap-4">
              <div>
                <label htmlFor="budget-total" className="text-xs text-zinc-500">
                  总预算(元)
                </label>
                <Input
                  id="budget-total"
                  type="number"
                  min={0}
                  placeholder="未设置"
                  className="tnum mt-1 h-9 w-32"
                  value={draft ?? (data.budgetTotal != null ? String(data.budgetTotal) : '')}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                />
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500">预计花费</p>
                <p className="tnum text-2xl font-semibold tracking-tight text-zinc-900">
                  {formatMoney(data.plannedTotal)}
                </p>
              </div>
            </div>

            {/* 预算进度 */}
            {pct !== null && remaining !== null && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      remaining >= 0 ? 'bg-accent-500' : 'bg-red-500',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p
                  className={cn(
                    'tnum mt-1.5 text-xs',
                    remaining >= 0 ? 'text-zinc-500' : 'font-medium text-red-600',
                  )}
                >
                  {remaining >= 0
                    ? `剩余 ${formatMoney(remaining)}(已用 ${pct}%)`
                    : `超出预算 ${formatMoney(-remaining)}`}
                </p>
              </div>
            )}

            {/* 分类汇总 */}
            <section>
              <h3 className="mb-2 text-xs font-medium text-zinc-500">分类汇总</h3>
              <ul className="space-y-2">
                {TYPE_ORDER.filter((t) => data.byType[t] > 0).map((t) => {
                  const meta = ITEM_TYPE_META[t]
                  const Icon = meta.icon
                  const share = data.plannedTotal > 0 ? (data.byType[t] / data.plannedTotal) * 100 : 0
                  return (
                    <li key={t} className="flex items-center gap-2.5">
                      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', meta.className)}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="w-10 text-sm text-zinc-700">{meta.label}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <span className="block h-full rounded-full bg-zinc-300" style={{ width: `${share}%` }} />
                      </span>
                      <span className="tnum w-16 text-right text-sm font-medium text-zinc-700">
                        {formatMoney(data.byType[t])}
                      </span>
                    </li>
                  )
                })}
                {data.plannedTotal === 0 && (
                  <p className="py-2 text-xs text-zinc-400">还没有条目填花费,点条目卡片右上角菜单就能编辑</p>
                )}
              </ul>
            </section>

            {/* 每日小计 */}
            <section>
              <h3 className="mb-2 text-xs font-medium text-zinc-500">每日小计</h3>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
                {data.byDay.map((d) => (
                  <li key={d.dayIndex} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-zinc-700">
                      Day {d.dayIndex + 1}
                      <span className="tnum ml-2 text-xs text-zinc-400">{d.date.slice(5)}</span>
                    </span>
                    <span className="tnum font-medium text-zinc-700">{formatMoney(d.total)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 人均 + 覆盖情况 */}
            <footer className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm">
              <span className="text-zinc-500">
                人均({data.memberCount} 人)
              </span>
              <span className="tnum font-semibold text-zinc-900">{formatMoney(Math.round(data.perPerson))}</span>
            </footer>
            {data.costedItemCount < data.itemCount && (
              <p className="-mt-3 text-xs text-zinc-400">
                还有 {data.itemCount - data.costedItemCount} 个条目未填花费,未计入汇总
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
