import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { formatMoney } from '../../lib/format'
import type { ItineraryItem, TripDay, TripDetail } from '../../types'
import { ITEM_TYPE_META } from './item-meta'
import { AddItemButton } from './add-item-button'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { toast } from '../../components/ui/toast'
import {
  Dialog,
  DialogContent,
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

interface TimelineProps {
  trip: TripDetail
  day: TripDay
  onHoverItem: (id: string | null) => void
}

function timeRange(item: ItineraryItem): string | null {
  if (item.startTime && item.endTime) return `${item.startTime} – ${item.endTime}`
  return item.startTime ?? item.endTime ?? null
}

function SortableItemCard({
  item,
  onEdit,
  onDelete,
  onHover,
}: {
  item: ItineraryItem
  onEdit: () => void
  onDelete: () => void
  onHover: (id: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const meta = ITEM_TYPE_META[item.type] ?? ITEM_TYPE_META.SPOT
  const Icon = meta.icon
  const time = timeRange(item)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group relative z-0',
        isDragging && 'z-20 opacity-70',
      )}
      onMouseEnter={() => onHover(item.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEdit()
        }}
        className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-zinc-200/70 bg-white p-3.5 shadow-card transition-shadow hover:shadow-float"
      >
        <button
          type="button"
          aria-label="拖拽调整顺序"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded-md p-0.5 text-zinc-300 transition-colors hover:text-zinc-500 active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl',
            meta.className,
          )}
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          {time && <p className="tnum text-xs font-medium text-zinc-400">{time}</p>}
          <p className="truncate text-sm font-medium text-zinc-900">{item.title}</p>
          {item.note && <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{item.note}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {item.cost != null && (
            <span className="tnum text-sm font-medium text-zinc-700">{formatMoney(item.cost)}</span>
          )}
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="更多操作"
                  className="flex size-7 items-center justify-center rounded-lg text-zinc-400 opacity-0 transition-all hover:bg-zinc-100 hover:text-zinc-700 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={onDelete}
                  className="text-red-600 data-[highlighted]:bg-red-50 [&_svg]:text-red-500"
                >
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditItemDialog({
  tripId,
  item,
  onClose,
}: {
  tripId: string
  item: ItineraryItem | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  // 打开时(而非挂载时)同步表单初值,避免受控组件闪烁
  if (item && item.id !== loadedFor) {
    setLoadedFor(item.id)
    setTitle(item.title)
    setStartTime(item.startTime ?? '')
    setEndTime(item.endTime ?? '')
    setCost(item.cost != null ? String(item.cost) : '')
    setNote(item.note ?? '')
  }

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/items/${item?.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('已保存')
      onClose()
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
    },
    onError: () => toast.error('保存失败,请稍后再试'),
  })

  const handleSave = () => {
    if (!title.trim()) return toast.error('名称不能为空')
    update.mutate({
      title: title.trim(),
      startTime: startTime || null,
      endTime: endTime || null,
      cost: cost.trim() ? Number(cost) : null,
      note: note.trim() || null,
    })
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑安排</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="item-title" className="text-sm font-medium text-zinc-700">
              名称
            </label>
            <Input id="item-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="item-start" className="text-sm font-medium text-zinc-700">
                开始时间
              </label>
              <Input
                id="item-start"
                type="time"
                className="tnum"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="item-end" className="text-sm font-medium text-zinc-700">
                结束时间
              </label>
              <Input
                id="item-end"
                type="time"
                className="tnum"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="item-cost" className="text-sm font-medium text-zinc-700">
              预计花费(元)
            </label>
            <Input
              id="item-cost"
              type="number"
              min={0}
              className="tnum"
              placeholder="如:120"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="item-note" className="text-sm font-medium text-zinc-700">
              备注
            </label>
            <Textarea
              id="item-note"
              rows={3}
              placeholder="交通贴士、预约信息…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" loading={update.isPending}>
              {update.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Timeline({ trip, day, onHoverItem }: TimelineProps) {
  const queryClient = useQueryClient()
  const queryKey = ['trip', trip.id]
  const [editing, setEditing] = useState<ItineraryItem | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const items = [...day.items].sort((a, b) => a.orderIndex - b.orderIndex)

  const reorder = useMutation({
    mutationFn: (itemIds: string[]) =>
      api('/items/reorder', { method: 'POST', body: JSON.stringify({ dayId: day.id, itemIds }) }),
    onMutate: async (itemIds) => {
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<TripDetail>(queryKey)
      queryClient.setQueryData<TripDetail>(queryKey, (old) =>
        old
          ? {
              ...old,
              days: old.days.map((d) =>
                d.id === day.id
                  ? {
                      ...d,
                      items: itemIds
                        .map((id, i) => {
                          const found = d.items.find((it) => it.id === id)
                          return found ? { ...found, orderIndex: i } : null
                        })
                        .filter((it): it is ItineraryItem => it !== null),
                    }
                  : d,
              ),
            }
          : old,
      )
      return { prev }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev)
      toast.error('排序失败,已恢复')
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  })

  const remove = useMutation({
    mutationFn: (itemId: string) => api(`/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('已删除')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: () => toast.error('删除失败,请稍后再试'),
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map((it) => it.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    reorder.mutate(arrayMove(ids, from, to))
  }

  return (
    <div className="px-4 py-4">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-10 text-center">
          <p className="text-sm text-zinc-500">这一天还没有安排</p>
          <p className="mt-1 text-xs text-zinc-400">搜一个想去的地方,或用 AI 一键生成</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
            <motion.div layout className="space-y-2.5">
              {items.map((item) => (
                <SortableItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => setEditing(item)}
                  onDelete={() => remove.mutate(item.id)}
                  onHover={onHoverItem}
                />
              ))}
            </motion.div>
          </SortableContext>
        </DndContext>
      )}

      <AddItemButton tripId={trip.id} dayId={day.id} destination={trip.destination} />

      <EditItemDialog tripId={trip.id} item={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
