import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, MapPinned, Star } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDateRange, formatMoney } from '../../lib/format'
import { cn } from '../../lib/utils'
import type { ItineraryItem, TripDetail } from '../../types'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { DayTabs } from '../trip/day-tabs'
import { MapView } from '../trip/map-view'
import { ITEM_TYPE_META } from '../trip/item-meta'

function timeRange(item: ItineraryItem): string | null {
  if (item.startTime && item.endTime) return `${item.startTime} – ${item.endTime}`
  return item.startTime ?? item.endTime ?? null
}

/** 只读条目卡片(分享页专用:无拖拽/编辑) */
function ReadonlyItemCard({ item }: { item: ItineraryItem }) {
  const meta = ITEM_TYPE_META[item.type] ?? ITEM_TYPE_META.SPOT
  const Icon = meta.icon
  const time = timeRange(item)
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-zinc-200/70 bg-white p-3.5 shadow-card">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl', meta.className)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {time && <p className="tnum text-xs font-medium text-zinc-400">{time}</p>}
        <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
        {item.note && <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{item.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.rating != null && (
          <span className="tnum flex items-center gap-0.5 text-xs font-semibold text-amber-600">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {item.rating.toFixed(1)}
          </span>
        )}
        {item.cost != null && (
          <span className="tnum text-sm font-medium text-zinc-700">{formatMoney(item.cost)}</span>
        )}
      </div>
    </div>
  )
}

/** 免登录分享只读页(visibility=LINK 的行程;关闭分享即 404) */
export default function SharePage() {
  const { id = '' } = useParams()
  const [activeDayIndex, setActiveDayIndex] = useState(0)

  const shareQuery = useQuery({
    queryKey: ['share', id],
    queryFn: () => api<TripDetail>(`/share/${id}`),
    enabled: Boolean(id),
    retry: false,
  })

  const trip = shareQuery.data
  const days = trip ? [...trip.days].sort((a, b) => a.dayIndex - b.dayIndex) : []
  const activeDay = days[Math.min(activeDayIndex, Math.max(days.length - 1, 0))]

  if (shareQuery.isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50">
        <Spinner className="size-6 text-accent-600" />
        <p className="text-sm text-zinc-500">行程加载中…</p>
      </div>
    )
  }

  if (shareQuery.isError || !trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <EmptyState
          icon={CircleAlert}
          title="分享链接无效"
          description="行程可能不存在,或作者已关闭分享"
          action={
            <Link to="/">
              <Button variant="secondary">去旅图看看</Button>
            </Link>
          }
          className="w-full max-w-md"
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      <header className="material-chrome z-30 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200/60 px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white">
          <MapPinned className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-tight">{trip.title}</p>
          <p className="tnum -mt-0.5 text-xs text-zinc-500">
            {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
          由 旅图 分享的行程
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[440px] shrink-0 flex-col border-r border-zinc-200/70 bg-white">
          <DayTabs days={days} activeIndex={activeDay?.dayIndex ?? 0} onSelect={setActiveDayIndex} />
          <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60 px-4 py-4">
            <div className="space-y-2.5">
              {(activeDay?.items ?? [])
                .slice()
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((item) => (
                  <ReadonlyItemCard key={item.id} item={item} />
                ))}
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1">
          <MapView day={activeDay} destination={trip.destination} hoveredItemId={null} />
        </section>
      </div>
    </div>
  )
}
