/** 从行程列表提取去重后的目的地(保持首次出现顺序,忽略空值) */
export function uniqueDestinations(trips: { destination: string }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of trips) {
    const d = t.destination.trim()
    if (!d || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

/** 城市筛选双向匹配(「安庆」与「安庆市」这类写法差异) */
export function destinationMatches(destination: string, city: string): boolean {
  const d = destination.trim()
  const c = city.trim()
  return d.includes(c) || c.includes(d)
}
