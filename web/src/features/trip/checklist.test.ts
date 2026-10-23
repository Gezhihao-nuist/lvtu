import { describe, expect, it } from 'vitest'
import type { WeatherCast } from '../../types'
import { buildChecklist } from './checklist'

const cast = (
  date: string,
  dayWeather: string,
  dayTemp: number,
  nightTemp: number,
  nightWeather = '多云',
): WeatherCast => ({ date, dayWeather, nightWeather, dayTemp, nightTemp })

describe('buildChecklist 行前清单生成', () => {
  it('无天气预报:只有 5 个基础项', () => {
    const items = buildChecklist({ destination: '北京', casts: [] })
    expect(items).toHaveLength(5)
    expect(items.every((i) => i.id.startsWith('base-'))).toBe(true)
  })

  it('有雨:追加雨具并注明哪天什么雨;多天雨只出一次', () => {
    const items = buildChecklist({
      destination: '漠河',
      casts: [cast('2026-10-22', '阴', 19, 13), cast('2026-10-23', '雨夹雪', 5, -2, '小雪')],
    })
    const umbrella = items.filter((i) => i.id === 'w-umbrella')
    expect(umbrella).toHaveLength(1)
    expect(umbrella[0]!.reason).toContain('10-23')
  })

  it('最高温 ≥28°C:追加防晒并注明最热天', () => {
    const items = buildChecklist({
      destination: '广州',
      casts: [cast('2026-10-22', '晴', 31, 24), cast('2026-10-23', '多云', 29, 23)],
    })
    const sun = items.find((i) => i.id === 'w-sun')
    expect(sun).toBeDefined()
    expect(sun!.reason).toContain('31°C')
  })

  it('夜温 ≤5°C 给厚外套;≤15°C 给薄外套;更暖则都不给', () => {
    const cold = buildChecklist({
      destination: '漠河',
      casts: [cast('2026-10-22', '晴', 8, 2)],
    })
    expect(cold.some((i) => i.id === 'w-coat')).toBe(true)
    expect(cold.some((i) => i.id === 'w-jacket')).toBe(false)

    const mild = buildChecklist({
      destination: '杭州',
      casts: [cast('2026-10-22', '晴', 22, 13)],
    })
    expect(mild.some((i) => i.id === 'w-jacket')).toBe(true)
    expect(mild.some((i) => i.id === 'w-coat')).toBe(false)

    const warm = buildChecklist({
      destination: '三亚',
      casts: [cast('2026-10-22', '晴', 27, 22)],
    })
    expect(warm.some((i) => i.id === 'w-coat' || i.id === 'w-jacket')).toBe(false)
  })

  it('夜间雨雪也触发雨具', () => {
    const items = buildChecklist({
      destination: '北京',
      casts: [cast('2026-10-22', '多云', 18, 10, '小雨')],
    })
    expect(items.some((i) => i.id === 'w-umbrella')).toBe(true)
  })
})
