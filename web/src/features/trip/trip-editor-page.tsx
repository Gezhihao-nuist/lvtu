import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleAlert, ClipboardList, HeartPulse, Pencil, Share2, Sparkles, Wallet } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDateRange } from '../../lib/format'
import type { TripDetail, WeatherCast } from '../../types'
import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast'
import { DayTabs } from './day-tabs'
import { Timeline } from './timeline'
import { AiPanel } from './ai-panel'
import { MapView } from './map-view'
import { BudgetDialog } from './budget-dialog'
import { ChecklistDialog } from './checklist-dialog'
import { HealthDialog } from './health-dialog'
import { ShareDialog } from './share-dialog'

function InlineTitle({ tripId, value }: { tripId: string; value: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const rename = useMutation({
    mutationFn: (title: string) =>
      api(`/trips/${tripId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['trip', tripId] }),
    onError: () => toast.error('改名失败,请稍后再试'),
  })

  const save = () => {
    setEditing(false)
    const title = draft.trim()
    if (title && title !== value) rename.mutate(title)
    else setDraft(value)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        aria-label="编辑行程标题"
        className="group flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-100"
      >
        <span className="max-w-64 truncate text-base font-semibold tracking-tight">{value}</span>
        <Pencil className="size-3.5 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    )
  }

  return (
    <input
      aria-label="行程标题"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      className="h-8 max-w-64 rounded-lg border border-accent-600 bg-white px-2 text-base font-semibold tracking-tight outline-none"
    />
  )
}

export default function TripEditorPage() {
  const { id = '' } = useParams()
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const [focusItemId, setFocusItemId] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(false)

  const tripQuery = useQuery({
    queryKey: ['trip', id],
    queryFn: () => api<TripDetail>(`/trips/${id}`),
    enabled: Boolean(id),
  })

  const trip = tripQuery.data

  // 天气预报(仅当天 + 未来 3 天有数据;失败静默降级,不显示徽标)
  const weatherQuery = useQuery({
    queryKey: ['weather', trip?.destination],
    queryFn: () =>
      api<{ casts: WeatherCast[] }>(
        `/geo/weather?city=${encodeURIComponent(trip!.destination)}`,
      ),
    enabled: Boolean(trip?.destination),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
  const weatherByDate = new Map(
    (weatherQuery.data?.casts ?? []).map((c) => [c.date, c]),
  )

  const days = trip ? [...trip.days].sort((a, b) => a.dayIndex - b.dayIndex) : []
  const activeDay = days[Math.min(activeDayIndex, Math.max(days.length - 1, 0))]

  if (tripQuery.isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50">
        <Spinner className="size-6 text-accent-600" />
        <p className="text-sm text-zinc-500">行程加载中…</p>
      </div>
    )
  }

  if (tripQuery.isError || !trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <EmptyState
          icon={CircleAlert}
          title="行程打开失败"
          description="行程可能不存在或已删除,回列表看看吧"
          action={
            <Link to="/trips">
              <Button variant="secondary">返回我的行程</Button>
            </Link>
          }
          className="w-full max-w-md"
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      {/* 顶栏 */}
      <header className="material-chrome z-30 flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200/60 px-4">
        <Link
          to="/trips"
          aria-label="返回行程列表"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <InlineTitle tripId={trip.id} value={trip.title} />
        <span className="tnum hidden shrink-0 text-sm text-zinc-500 md:block">
          {formatDateRange(trip.startDate, trip.endDate)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="icon" variant="outline" title="分享行程" onClick={() => setShareOpen(true)}>
            <Share2 />
          </Button>
          <Button size="icon" variant="outline" title="预算与花费" onClick={() => setBudgetOpen(true)}>
            <Wallet />
          </Button>
          <Button size="icon" variant="outline" title="行程体检" onClick={() => setHealthOpen(true)}>
            <HeartPulse />
          </Button>
          <Button size="icon" variant="outline" title="行前清单" onClick={() => setChecklistOpen(true)}>
            <ClipboardList />
          </Button>
          <Button size="sm" className="ml-1" onClick={() => setAiOpen(true)}>
            <Sparkles />
            AI 规划
          </Button>
        </div>
      </header>

      {/* 主体:左栏时间轴 + 右栏地图 */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[440px] shrink-0 flex-col border-r border-zinc-200/70 bg-white">
          <DayTabs days={days} activeIndex={activeDay?.dayIndex ?? 0} onSelect={setActiveDayIndex} weatherByDate={weatherByDate} />
          <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
            {activeDay && (
              <Timeline trip={trip} day={activeDay} onHoverItem={setHoveredItemId} onLocate={setFocusItemId} />
            )}
          </div>
        </aside>
        <section className="min-w-0 flex-1">
          <MapView day={activeDay} destination={trip.destination} hoveredItemId={hoveredItemId} weatherCasts={weatherQuery.data?.casts} focusItemId={focusItemId} />
        </section>
      </div>

      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} trip={trip} />
      <BudgetDialog open={budgetOpen} onClose={() => setBudgetOpen(false)} trip={trip} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} trip={trip} />
      <HealthDialog open={healthOpen} onClose={() => setHealthOpen(false)} trip={trip} />
      <ChecklistDialog open={checklistOpen} onClose={() => setChecklistOpen(false)} trip={trip} />
    </div>
  )
}
