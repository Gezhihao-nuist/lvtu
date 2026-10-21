import type { TripDay, WeatherCast } from '../../types'
import { cn } from '../../lib/utils'
import { weatherIcon } from './weather-icon'

interface DayTabsProps {
  days: TripDay[]
  activeIndex: number
  onSelect: (index: number) => void
  /** date('YYYY-MM-DD') → 当日天气;无预报覆盖的日期不显示徽标 */
  weatherByDate?: Map<string, WeatherCast>
}

function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(m)}/${Number(d)}`
}

export function DayTabs({ days, activeIndex, onSelect, weatherByDate }: DayTabsProps) {
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
        return (
          <button
            key={day.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(i)}
            className={cn(
              'flex shrink-0 flex-col items-center rounded-xl px-3.5 py-1.5 transition-colors',
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
        )
      })}
    </div>
  )
}
