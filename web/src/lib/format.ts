const dayFmt = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const moneyFmt = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
})

/** 'YYYY-MM-DD' -> 本地 Date(避免时区偏移) */
function parse(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** '2026-10-21' → '10月21日 周三' */
export function formatDate(iso: string): string {
  return dayFmt.format(parse(iso))
}

/** '10月21日 – 10月23日 周三–周五' 简版:'M月D日 – M月D日' */
export function formatDateRange(start: string, end: string): string {
  const s = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(parse(start))
  const e = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(parse(end))
  return s === e ? s : `${s} – ${e}`
}

export function formatMoney(n: number): string {
  return moneyFmt.format(n)
}

export function addDays(iso: string, n: number): string {
  const d = parse(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

/** b - a 的天数差 */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

/** 今天的 'YYYY-MM-DD' */
export function todayIso(): string {
  return toIso(new Date())
}
