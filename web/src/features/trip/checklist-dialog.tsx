import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ClipboardList, RotateCcw } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import type { TripDetail, WeatherCast } from '../../types'
import { buildChecklist, type ChecklistItem } from './checklist'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

const storageKey = (tripId: string) => `lvtu:checklist:${tripId}`

function loadChecked(tripId: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(tripId)) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

interface ChecklistDialogProps {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

/** 行前清单:基础物品 + 天气联动增减项;勾选状态存 localStorage(按行程隔离) */
export function ChecklistDialog({ open, onClose, trip }: ChecklistDialogProps) {
  const weatherQuery = useQuery({
    queryKey: ['weather', trip.destination],
    queryFn: () => api<{ casts: WeatherCast[] }>(`/geo/weather?city=${encodeURIComponent(trip.destination)}`),
    enabled: open,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  const items = buildChecklist({
    destination: trip.destination,
    casts: weatherQuery.data?.casts ?? [],
  })

  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadChecked(trip.id))
  const doneCount = items.filter((i) => checked[i.id]).length

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(storageKey(trip.id), JSON.stringify(next))
      } catch {
        /* 存储不可用时仅在内存中生效 */
      }
      return next
    })
  }

  const reset = () => {
    setChecked({})
    try {
      localStorage.removeItem(storageKey(trip.id))
    } catch {
      /* ignore */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-4.5 text-zinc-500" />
            行前清单
          </DialogTitle>
          <DialogDescription>
            按目的地天气自动生成;勾选进度只保存在这台设备上
          </DialogDescription>
        </DialogHeader>

        {/* 进度 */}
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-accent-500 transition-all"
              style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
            />
          </div>
          <p className="tnum mt-1.5 text-xs text-zinc-500">
            已完成 {doneCount}/{items.length}
          </p>
        </div>

        <ul className="space-y-1">
          {items.map((item: ChecklistItem) => {
            const done = Boolean(checked[item.id])
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  onClick={() => toggle(item.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-50"
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                      done ? 'border-accent-600 bg-accent-600 text-white' : 'border-zinc-300 bg-white',
                    )}
                  >
                    {done && <Check className="size-3.5" />}
                  </span>
                  <span className={cn('flex-1 text-sm', done ? 'text-zinc-400 line-through' : 'text-zinc-800')}>
                    {item.label}
                  </span>
                  {item.reason && (
                    <span className="tnum shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-600">
                      {item.reason}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex justify-end border-t border-zinc-100 pt-3">
          <Button size="sm" variant="ghost" onClick={reset} disabled={doneCount === 0}>
            <RotateCcw />
            重置勾选
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
