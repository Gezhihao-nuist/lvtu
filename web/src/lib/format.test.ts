import { describe, expect, it } from 'vitest'
import {
  addDays,
  diffDays,
  formatDate,
  formatDateRange,
  formatMoney,
  todayIso,
} from './format'

describe('format 日期与金额工具', () => {
  it('formatDate:输出「10月21日 周三」格式(含星期;空格随 ICU 版本可有可无)', () => {
    // 2026-10-21 是周三
    expect(formatDate('2026-10-21')).toMatch(/^10月21日\s?周三$/)
  })

  it('formatDate:兼容后端完整 ISO(白屏防御,slice 取前 10 位)', () => {
    expect(formatDate('2026-10-21T00:00:00.000Z')).toMatch(/^10月21日\s?周三$/)
  })

  it('formatDateRange:同一天只显示一次;跨天显示区间', () => {
    expect(formatDateRange('2026-10-21', '2026-10-21')).toBe('10月21日')
    expect(formatDateRange('2026-10-21', '2026-10-23')).toBe('10月21日 – 10月23日')
  })

  it('addDays:跨月进位正确', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-10-21', 3)).toBe('2026-10-24')
  })

  it('diffDays:整数天数差', () => {
    expect(diffDays('2026-10-21', '2026-10-24')).toBe(3)
    expect(diffDays('2026-10-24', '2026-10-21')).toBe(-3)
  })

  it('formatMoney:人民币无小数', () => {
    expect(formatMoney(120)).toBe('¥120')
  })

  it('todayIso:YYYY-MM-DD 格式', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
