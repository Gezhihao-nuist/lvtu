import type { WeatherCast } from '../../types'

export interface ChecklistItem {
  id: string
  label: string
  /** 触发原因(如「10-23 小雨」),基础项没有 */
  reason?: string
}

interface ChecklistInput {
  destination: string
  /** 目的地天气预报(可为空数组,此时只出基础项) */
  casts: WeatherCast[]
}

const BASE_ITEMS: ChecklistItem[] = [
  { id: 'base-id', label: '身份证(及复印件)' },
  { id: 'base-phone', label: '手机与充电器' },
  { id: 'base-powerbank', label: '充电宝' },
  { id: 'base-medicine', label: '常用药品' },
  { id: 'base-toiletry', label: '旅行装洗漱用品' },
]

const RAINY_RE = /雨|雪|冰雹/

/**
 * 行前清单生成(纯函数,确定性):
 * 基础物品 + 按天气预报推导的增减项——
 * 雨雪天带雨具、高温带防晒、寒夜带厚外套、凉夜带薄外套,
 * 每项附触发原因(具体哪天什么天气),同一规则多天只出一次。
 */
export function buildChecklist({ casts }: ChecklistInput): ChecklistItem[] {
  const items = [...BASE_ITEMS]

  const rainy = casts.find(
    (c) => RAINY_RE.test(c.dayWeather) || RAINY_RE.test(c.nightWeather),
  )
  if (rainy) {
    items.push({
      id: 'w-umbrella',
      label: '雨伞 / 雨衣',
      reason: `${rainy.date.slice(5)} ${rainy.dayWeather}`,
    })
  }

  const hottest = casts.reduce<WeatherCast | null>(
    (m, c) => (m === null || c.dayTemp > m.dayTemp ? c : m),
    null,
  )
  if (hottest && hottest.dayTemp >= 28) {
    items.push({
      id: 'w-sun',
      label: '防晒霜、遮阳帽',
      reason: `${hottest.date.slice(5)} 最高 ${hottest.dayTemp}°C`,
    })
  }

  const coldest = casts.reduce<WeatherCast | null>(
    (m, c) => (m === null || c.nightTemp < m.nightTemp ? c : m),
    null,
  )
  if (coldest && coldest.nightTemp <= 5) {
    items.push({
      id: 'w-coat',
      label: '厚外套、保暖衣物',
      reason: `${coldest.date.slice(5)} 夜间 ${coldest.nightTemp}°C`,
    })
  } else if (coldest && coldest.nightTemp <= 15) {
    items.push({
      id: 'w-jacket',
      label: '薄外套',
      reason: `${coldest.date.slice(5)} 夜间 ${coldest.nightTemp}°C`,
    })
  }

  return items
}
