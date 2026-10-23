import type { TripDay, WeatherCast } from '../../types'
import { cn } from '../../lib/utils'
import { weatherIcon } from './weather-icon'
import { Plus, X } from 'lucide-react'

interface DayTabsProps {
  days: TripDay[]
  activeIndex: number
  onSelect: (index: number) => void
  /** date('YYYY-MM-DD') → 当日天气;无预报覆盖的日期不显示徽标 */
  weatherByDate?: Map<string, WeatherCast>
  /** 末尾追加一天(达 30 天上限时父组件置灰并提示) */
  onAddDay?: () => void
  /** 删除最后一天(父组件负责确认;仅剩一天时不显示) */
  onRemoveLastDay?: () => void
  /** 追加/删除进行中,禁用按钮防连点 */
  dayMutating?: boolean
}

function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(m)}/${Number(d)}`
}

export function DayTabs({
  days,
  activeIndex,
  onSelect,
  weatherByDate,
  onAddDay,
  onRemoveLastDay,
  dayMutating,
}: DayTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="行程天数"
      className="flex gap-1 overflow-x-auto border-b border-zinc-200/70 bg-white px-4 py-3"
    >
      {days.map((day, i) => {
        const active = i === activeIndex
        const cast = weatherByDate?.get(day.date.slice(0, 10))
        const Icon = cast ? weatherIcon(cast.dayWeather) : null
        const isLast = i === days.length - 1
        return (
          <div key={day.id} className="group/tab relative shrink-0">
            <button
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(i)}
              className={cn(
                'flex flex-col items-center rounded-xl px-3.5 py-1.5 transition-colors',
                active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
              )}
            >
              <span className="text-[13px] font-semibold leading-tight">Day {day.dayIndex + 1}</span>
              <span className={cn('tnum text-[11px] leading-tight', active ? 'text-zinc-300' : 'text-zinc-400')}>
                {shortDate(day.date)}
              </span>
              {cast && Icon && (
                <span
                  title={`${cast.dayWeather === cast.nightWeather ? cast.dayWeather : `${cast.dayWeather}转${cast.nightWeather}`} ${cast.nightTemp}~${cast.dayTemp}°C`}
                  className={cn(
                    'tnum mt-0.5 flex items-center gap-0.5 text-[10px] leading-tight',
                    active ? 'text-amber-300' : 'text-amber-600',
                  )}
                >
                  <Icon className="size-3" />
                  {cast.dayTemp}°
                </span>
              )}
            </button>
            {/* 删除最后一天:hover 显示,不影响 tab 点击 */}
            {isLast && days.length > 1 && onRemoveLastDay && (
              <button
                type="button"
                aria-label={`删除 Day ${day.dayIndex + 1}`}
                title={`删除 Day ${day.dayIndex + 1}`}
                disabled={dayMutating}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveLastDay()
                }}
                className="absolute -right-1 -top-1 flex size-4.5 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 opacity-0 shadow-card transition-opacity hover:bg-red-500 hover:text-white focus-visible:opacity-100 group-hover/tab:opacity-100"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )
      })}
      {/* 追加一天 */}
      {onAddDay && (
        <button
          type="button"
          aria-label="添加一天"
          title="添加一天"
          disabled={dayMutating}
          onClick={onAddDay}
          className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 px-3 py-1.5 text-zinc-400 transition-colors hover:border-accent-500 hover:text-accent-600 disabled:opacity-40"
        >
          <Plus className="size-4" />
          <span className="text-[11px] leading-tight">一天</span>
        </button>
      )}
    </div>
  )
}
