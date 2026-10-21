import type { TripDay } from '../../types'
import { cn } from '../../lib/utils'

interface DayTabsProps {
  days: TripDay[]
  activeIndex: number
  onSelect: (index: number) => void
}

function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(m)}/${Number(d)}`
}

export function DayTabs({ days, activeIndex, onSelect }: DayTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="行程天数"
      className="flex gap-1 overflow-x-auto border-b border-zinc-200/70 bg-white px-4 py-3"
    >
      {days.map((day, i) => {
        const active = i === activeIndex
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
          </button>
        )
      })}
    </div>
  )
}
