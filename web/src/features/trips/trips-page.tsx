import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarDays, Copy, MapPin, MoreVertical, Plus, Route, Trash2, Wallet } from 'lucide-react'
import { api } from '../../lib/api'
import { formatDateRange, formatMoney } from '../../lib/format'
import { cityCover, FALLBACK_COVER } from './city-covers'
import type { TripSummary } from '../../types'
import { AppHeader } from '../../components/layout/app-header'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { EmptyState } from '../../components/ui/empty-state'
import { toast } from '../../components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { NewTripDialog } from './new-trip-dialog'

function TripCard({
  trip,
  onCopy,
  onDelete,
}: {
  trip: TripSummary
  onCopy: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-float"
      onClick={() => navigate(`/trips/${trip.id}`)}
    >
      {/* 封面:自定义图优先,否则用对应城市实景图(object-cover 裁切填充,不变形不溢出) */}
      <div className="relative h-36 overflow-hidden bg-zinc-100">
        <img
          src={trip.coverUrl ?? cityCover(trip.destination)}
          alt=""
          width={800}
          height={450}
          loading="lazy"
          onError={(e) => {
            // 生成图/自定义图失败时回退通用风景,避免破图(防循环:兜底图再失败则放弃)
            const el = e.currentTarget
            if (!el.src.startsWith(FALLBACK_COVER.slice(0, 60))) {
              el.src = FALLBACK_COVER
            }
          }}
          className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        <div onClick={(e) => e.stopPropagation()} className="absolute right-2.5 top-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="更多操作"
                className="flex size-8 items-center justify-center rounded-lg bg-white/90 text-zinc-600 opacity-0 shadow-card backdrop-blur transition-opacity hover:bg-white hover:text-zinc-900 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onCopy}>
                <Copy />
                创建副本
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-red-600 data-[highlighted]:bg-red-50 [&_svg]:text-red-500"
              >
                <Trash2 />
                删除行程
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-5">
        <h3 className="truncate text-base font-medium text-zinc-900">{trip.title}</h3>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-zinc-500">
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" />
            <span className="max-w-28 truncate">{trip.destination}</span>
          </span>
          <span className="tnum flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDateRange(trip.startDate, trip.endDate)} · {trip.dayCount} 天
          </span>
          {trip.budgetTotal != null && (
            <span className="tnum flex items-center gap-1">
              <Wallet className="size-3.5" />
              {formatMoney(trip.budgetTotal)}
            </span>
          )}
        </div>
      </div>
    </motion.article>
  )
}

function TripsSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-card"
        >
          <Skeleton className="h-36 rounded-none" />
          <div className="space-y-2.5 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TripsPage() {
  const queryClient = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  const [deleting, setDeleting] = useState<TripSummary | null>(null)

  const tripsQuery = useQuery({
    queryKey: ['trips'],
    queryFn: () => api<TripSummary[]>('/trips'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['trips'] })

  const copyMutation = useMutation({
    mutationFn: (id: string) => api(`/trips/${id}/copy`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('已创建副本')
      void invalidate()
    },
    onError: () => toast.error('复制失败,请稍后再试'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/trips/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('行程已删除')
      setDeleting(null)
      void invalidate()
    },
    onError: () => toast.error('删除失败,请稍后再试'),
  })

  const trips = tripsQuery.data

  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">我的行程</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {trips ? `共 ${trips.length} 段旅程` : '每一段旅程,都从一张图开始'}
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)}>
            <Plus />
            新建行程
          </Button>
        </div>

        {tripsQuery.isPending ? (
          <TripsSkeleton />
        ) : tripsQuery.isError ? (
          <EmptyState
            icon={Route}
            title="行程加载失败"
            description="检查网络后重试,或稍后再来看看"
            action={
              <Button variant="secondary" onClick={() => void tripsQuery.refetch()}>
                重新加载
              </Button>
            }
          />
        ) : trips && trips.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onCopy={() => copyMutation.mutate(trip.id)}
                onDelete={() => setDeleting(trip)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Route}
            title="还没有行程"
            description="创建第一段旅程,让 AI 帮你把每天安排得明明白白"
            action={
              <Button onClick={() => setNewOpen(true)}>
                <Plus />
                新建行程
              </Button>
            }
          />
        )}
      </main>

      <NewTripDialog open={newOpen} onOpenChange={setNewOpen} />

      {/* 删除确认 */}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除行程</DialogTitle>
            <DialogDescription>
              将永久删除「{deleting?.title}」及其全部日程,此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
