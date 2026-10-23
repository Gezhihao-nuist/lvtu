import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Star } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDate, formatDateRange, formatMoney } from '../../lib/format'
import type { ItineraryItem, TripDetail } from '../../types'
import { Button } from '../../components/ui/button'
import { Spinner } from '../../components/ui/spinner'
import { ITEM_TYPE_META } from './item-meta'

function timeRange(item: ItineraryItem): string {
  if (item.startTime && item.endTime) return `${item.startTime} – ${item.endTime}`
  return item.startTime ?? item.endTime ?? '—'
}

/**
 * 行程单打印页:干净的纸面排版,浏览器打印/另存 PDF 即可导出。
 * 屏幕显示顶部工具条,打印时自动隐藏(@media print)。
 */
export default function TripPrintPage() {
  const { id } = useParams<{ id: string }>()
  const tripQuery = useQuery({
    queryKey: ['trip', id],
    queryFn: () => api<TripDetail>(`/trips/${id}`),
    enabled: Boolean(id),
  })
  const trip = tripQuery.data

  if (tripQuery.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        <Spinner />
        行程单生成中…
      </div>
    )
  }
  if (tripQuery.isError || !trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-zinc-500">
        行程加载失败
        <Link to={`/trips/${id}`} className="text-accent-700 underline underline-offset-2">
          返回行程
        </Link>
      </div>
    )
  }

  const itemCount = trip.days.reduce((s, d) => s + d.items.length, 0)
  const totalCost = trip.days.reduce(
    (s, d) => s + d.items.reduce((a, it) => a + (it.cost ?? 0), 0),
    0,
  )

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white">
      {/* 屏幕工具条:打印时隐藏 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-6 py-3 backdrop-blur print:hidden">
        <Link
          to={`/trips/${trip.id}`}
          className="flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-800"
        >
          <ArrowLeft className="size-4" />
          返回行程
        </Link>
        <span className="text-sm text-zinc-400">打印对话框里选「另存为 PDF」即可导出</span>
        <Button size="sm" className="ml-auto" onClick={() => window.print()}>
          <Printer />
          打印 / 存 PDF
        </Button>
      </div>

      {/* 纸面文档 */}
      <main className="mx-auto my-8 max-w-3xl bg-white px-12 py-10 shadow-card print:my-0 print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {/* 抬头 */}
        <header className="border-b-2 border-zinc-900 pb-5">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{trip.title}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)} · {trip.days.length} 天 ·{' '}
            {itemCount} 个安排
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            {trip.budgetTotal != null && <>总预算 {formatMoney(trip.budgetTotal)} · </>}
            预计花费 {formatMoney(totalCost)}
          </p>
        </header>

        {/* 逐日行程 */}
        {trip.days.map((day) => (
          <section key={day.id} className="mt-7" style={{ breakInside: 'avoid-page' }}>
            <h2 className="flex items-baseline gap-2.5 text-base font-semibold text-zinc-900">
              <span className="flex size-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                {day.dayIndex + 1}
              </span>
              {formatDate(day.date)}
              {day.note && (
                <span className="text-xs font-normal text-zinc-500">{day.note}</span>
              )}
            </h2>
            {day.items.length === 0 ? (
              <p className="mt-2 pl-9 text-sm text-zinc-400">当日暂无安排</p>
            ) : (
              <table className="mt-3 w-full border-collapse text-sm">
                <tbody>
                  {day.items.map((it) => {
                    const meta = ITEM_TYPE_META[it.type] ?? ITEM_TYPE_META.SPOT
                    return (
                      <tr key={it.id} className="border-b border-zinc-100 align-top last:border-0">
                        <td className="tnum w-28 py-2 pl-9 pr-2 text-zinc-500">{timeRange(it)}</td>
                        <td className="w-14 py-2 pr-2">
                          <span className="text-xs font-medium text-zinc-500">[{meta.label}]</span>
                        </td>
                        <td className="py-2 pr-2">
                          <span className="font-medium text-zinc-900">{it.title}</span>
                          {it.rating != null && (
                            <span className="tnum ml-1.5 inline-flex items-center gap-0.5 text-xs text-amber-600">
                              <Star className="size-3 fill-amber-500 text-amber-500" />
                              {it.rating}
                            </span>
                          )}
                          {it.note && (
                            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                              {it.note}
                            </span>
                          )}
                        </td>
                        <td className="tnum w-20 py-2 text-right text-zinc-600">
                          {it.cost != null && it.cost > 0 ? formatMoney(it.cost) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        ))}

        <footer className="mt-10 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
          由「旅图」AI 旅行规划生成 · {new Date().toLocaleDateString('zh-CN')}
        </footer>
      </main>
    </div>
  )
}
