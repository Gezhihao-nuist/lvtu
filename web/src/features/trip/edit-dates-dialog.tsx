import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { TripDetail } from '../../types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { toast } from '../../components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

interface EditDatesDialogProps {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

const key = (iso: string) => iso.slice(0, 10)

/** 编辑行程起止日期;缩短区间会级联删除区间外的天(含安排),提交前明确警示 */
export function EditDatesDialog({ open, onClose, trip }: EditDatesDialogProps) {
  const queryClient = useQueryClient()
  const [start, setStart] = useState(key(trip.startDate))
  const [end, setEnd] = useState(key(trip.endDate))

  // 每次打开重置为当前行程日期
  useEffect(() => {
    if (open) {
      setStart(key(trip.startDate))
      setEnd(key(trip.endDate))
    }
  }, [open, trip.startDate, trip.endDate])

  /** 新区间外的现有天(将被删除)及其包含的安排数 */
  const dropping = useMemo(() => {
    if (!start || !end || end < start) return { days: 0, items: 0 }
    const victims = trip.days.filter((d) => {
      const k = key(d.date)
      return k < start || k > end
    })
    return {
      days: victims.length,
      items: victims.reduce((s, d) => s + d.items.length, 0),
    }
  }, [trip.days, start, end])

  const dayCount =
    start && end && end >= start
      ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
      : 0
  const invalid = !start || !end || end < start
  const tooLong = dayCount > 30
  const unchanged = start === key(trip.startDate) && end === key(trip.endDate)

  const mutation = useMutation({
    mutationFn: () =>
      api(`/trips/${trip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ startDate: start, endDate: end }),
      }),
    onSuccess: () => {
      toast.success('行程日期已更新')
      void queryClient.invalidateQueries({ queryKey: ['trip', trip.id] })
      void queryClient.invalidateQueries({ queryKey: ['trips'] })
      onClose()
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : '更新失败,请稍后再试'),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>编辑行程日期</DialogTitle>
          <DialogDescription>
            天数由起止日期决定:延长会在末尾补新的天空白天,缩短会删除区间外的天。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="edit-start" className="text-sm font-medium text-zinc-700">
              开始日期
            </label>
            <Input
              id="edit-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-end" className="text-sm font-medium text-zinc-700">
              结束日期
            </label>
            <Input
              id="edit-end"
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>

        {!invalid && (
          <p className="text-sm text-zinc-500">
            共 <span className="tnum font-medium text-zinc-800">{dayCount}</span> 天
            {tooLong && <span className="ml-1 text-red-600">超过 30 天上限</span>}
          </p>
        )}
        {dropping.days > 0 && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            新区间外的 {dropping.days} 天将被删除
            {dropping.items > 0 && `,其中 ${dropping.items} 个安排会一并移除`}。
          </p>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={invalid || tooLong || unchanged}
            onClick={() => mutation.mutate()}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
