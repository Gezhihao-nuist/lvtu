import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle, MapPin, Plus, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import type { Poi } from '../../types'
import { guessTypeFromPoi } from './item-meta'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { toast } from '../../components/ui/toast'

interface AddItemButtonProps {
  tripId: string
  dayId: string
  destination: string
}

interface CreateItemBody {
  title: string
  type: string
  poiId?: string
  lng?: number
  lat?: number
}

export function AddItemButton({ tripId, dayId, destination }: AddItemButtonProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'search' | 'manual'>('search')
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [manualTitle, setManualTitle] = useState('')

  // 300ms 防抖
  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword.trim()), 300)
    return () => clearTimeout(t)
  }, [keyword])

  const poiQuery = useQuery({
    queryKey: ['poi', destination, debounced],
    queryFn: () =>
      api<{ pois: Poi[] }>(
        `/geo/poi?keyword=${encodeURIComponent(debounced)}&city=${encodeURIComponent(destination)}`,
      ),
    enabled: open && tab === 'search' && debounced.length > 0,
    retry: false,
    staleTime: 60_000,
  })

  const addItem = useMutation({
    mutationFn: (body: CreateItemBody) =>
      api(`/days/${dayId}/items`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success('已添加到行程')
      setKeyword('')
      setManualTitle('')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
    },
    onError: () => toast.error('添加失败,请稍后再试'),
  })

  const pickPoi = (poi: Poi) => {
    addItem.mutate({
      title: poi.name,
      type: guessTypeFromPoi(poi.type),
      poiId: poi.id,
      lng: poi.lng,
      lat: poi.lat,
    })
  }

  const submitManual = () => {
    const title = manualTitle.trim()
    if (!title) return
    addItem.mutate({ title, type: 'SPOT' })
  }

  const geoUnavailable = poiQuery.isError

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-zinc-300 py-2.5 text-sm text-zinc-500 transition-colors hover:border-accent-400 hover:bg-accent-50/50 hover:text-accent-700"
        >
          <Plus className="size-4" />
          添加安排
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px]">
        {/* 搜索 / 手动 切换 */}
        <div className="mb-3 flex rounded-lg bg-zinc-100 p-0.5" role="tablist" aria-label="添加方式">
          {(
            [
              { key: 'search', label: '搜索地点' },
              { key: 'manual', label: '手动输入' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-[13px] font-medium transition-colors',
                tab === t.key ? 'bg-white text-zinc-900 shadow-card' : 'text-zinc-500 hover:text-zinc-800',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'search' ? (
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                aria-label="搜索地点"
                className="pl-9"
                placeholder={`在${destination}搜索…`}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="mt-2 max-h-64 overflow-y-auto">
              {geoUnavailable ? (
                <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                  <CircleAlert className="size-5 text-zinc-400" />
                  <p className="text-sm text-zinc-500">地点搜索暂不可用(未配置高德 Key)</p>
                  <button
                    type="button"
                    onClick={() => setTab('manual')}
                    className="text-sm font-medium text-accent-600 hover:text-accent-700"
                  >
                    改为手动输入
                  </button>
                </div>
              ) : poiQuery.isFetching ? (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
                  <LoaderCircle className="size-4 animate-spin" />
                  搜索中…
                </p>
              ) : debounced && poiQuery.data && poiQuery.data.pois.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-500">没有找到相关地点</p>
              ) : poiQuery.data ? (
                <ul className="space-y-0.5">
                  {poiQuery.data.pois.map((poi) => (
                    <li key={poi.id}>
                      <button
                        type="button"
                        onClick={() => pickPoi(poi)}
                        disabled={addItem.isPending}
                        className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-100 disabled:opacity-50"
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-zinc-900">
                            {poi.name}
                          </span>
                          <span className="block truncate text-xs text-zinc-500">{poi.address}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-xs text-zinc-400">输入名称,如景点、餐厅、酒店</p>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitManual()
            }}
            className="flex gap-2"
          >
            <Input
              aria-label="安排名称"
              placeholder="如:清水寺、蟹道乐"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="md" loading={addItem.isPending} disabled={!manualTitle.trim()}>
              添加
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  )
}
