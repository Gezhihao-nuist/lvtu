import { BedDouble, MapPin, TrainFront, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { ItemType } from '../../types'

interface ItemTypeMeta {
  label: string
  icon: LucideIcon
  /** 柔和底色圆角方块 */
  className: string
  /** 地图 marker 用纯色 */
  hex: string
  bgHex: string
}

export const ITEM_TYPE_META: Record<ItemType, ItemTypeMeta> = {
  SPOT: { label: '景点', icon: MapPin, className: 'bg-accent-50 text-accent-700', hex: '#0d9488', bgHex: '#ccfbf1' },
  FOOD: { label: '美食', icon: UtensilsCrossed, className: 'bg-orange-50 text-orange-600', hex: '#ea580c', bgHex: '#ffedd5' },
  HOTEL: { label: '住宿', icon: BedDouble, className: 'bg-violet-50 text-violet-600', hex: '#7c3aed', bgHex: '#ede9fe' },
  TRANSPORT: { label: '交通', icon: TrainFront, className: 'bg-sky-50 text-sky-600', hex: '#0284c7', bgHex: '#e0f2fe' },
}

/** 高德 POI type 文案 → 条目类型的启发式映射 */
export function guessTypeFromPoi(poiType: string): ItemType {
  if (/餐|美食|小吃|茶|咖啡|酒吧/.test(poiType)) return 'FOOD'
  if (/宾馆|酒店|住宿|旅馆|民宿/.test(poiType)) return 'HOTEL'
  if (/交通|车站|机场|地铁|港口|口岸/.test(poiType)) return 'TRANSPORT'
  return 'SPOT'
}
