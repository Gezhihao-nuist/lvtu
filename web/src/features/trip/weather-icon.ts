import type { ComponentType } from 'react'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react'

/** 高德天气现象 → lucide 图标(按关键词包含匹配,顺序即优先级) */
const RULES: [RegExp, ComponentType<{ className?: string }>][] = [
  [/雷/, CloudLightning],
  [/雪|雨夹雪/, CloudSnow],
  [/雨|冰雹/, CloudRain],
  [/雾|霾/, CloudFog],
  [/晴/, Sun],
  [/多云/, CloudSun],
  [/阴/, Cloud],
]

export function weatherIcon(
  weather: string,
): ComponentType<{ className?: string }> {
  for (const [re, icon] of RULES) {
    if (re.test(weather)) return icon
  }
  return Cloud
}
