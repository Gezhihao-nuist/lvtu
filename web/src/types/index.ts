export interface User {
  id: string
  email: string
  nickname: string
  avatarUrl: string | null
}

export type ItemType = 'SPOT' | 'FOOD' | 'HOTEL' | 'TRANSPORT'

export interface ItineraryItem {
  id: string
  orderIndex: number
  type: ItemType
  title: string
  poiId: string | null
  poiType: string | null
  /** 高德 POI 评分(0-5);无评分数据为 null */
  rating: number | null
  lng: number | null
  lat: number | null
  startTime: string | null
  endTime: string | null
  cost: number | null
  note: string | null
}

export interface TripDay {
  id: string
  dayIndex: number
  date: string
  note: string | null
  items: ItineraryItem[]
}

export interface TripSummary {
  id: string
  title: string
  destination: string
  startDate: string
  endDate: string
  coverUrl: string | null
  budgetTotal: number | null
  visibility: string
  role: string
  dayCount: number
  itemCount: number
  updatedAt: string
}

export interface TripDetail {
  id: string
  title: string
  destination: string
  startDate: string
  endDate: string
  budgetTotal: number | null
  coverUrl: string | null
  visibility: string
  days: TripDay[]
}

export interface Poi {
  id: string
  name: string
  type: string
  address: string
  lng: number
  lat: number
}

/** 高德输入提示(inputtips):比 Poi 多行政区信息 */
export interface PoiTip extends Poi {
  district: string
}

/** 行程预算汇总(GET /trips/:id/budget) */
export interface BudgetSummary {
  budgetTotal: number | null
  plannedTotal: number
  byType: Record<ItemType, number>
  byDay: { dayIndex: number; date: string; total: number }[]
  itemCount: number
  costedItemCount: number
  memberCount: number
  perPerson: number
}

/** 高德单日天气预报(仅覆盖当天 + 未来 3 天) */
export interface WeatherCast {
  date: string
  dayWeather: string
  nightWeather: string
  dayTemp: number
  nightTemp: number
}

export type SseEvent =
  | { type: 'progress'; text: string }
  | { type: 'done'; dayCount: number; itemCount: number }
  | { type: 'error'; message: string }
