import { describe, expect, it } from 'vitest'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react'
import { weatherIcon } from './weather-icon'

describe('weatherIcon 天气现象 → 图标', () => {
  it('雷 > 雪 > 雨 > 雾 > 晴 > 多云 > 阴 的优先级匹配', () => {
    expect(weatherIcon('晴')).toBe(Sun)
    expect(weatherIcon('多云')).toBe(CloudSun)
    expect(weatherIcon('阴')).toBe(Cloud)
    expect(weatherIcon('雷阵雨')).toBe(CloudLightning)
    expect(weatherIcon('小雪')).toBe(CloudSnow)
    expect(weatherIcon('雨夹雪')).toBe(CloudSnow)
    expect(weatherIcon('中雨')).toBe(CloudRain)
    expect(weatherIcon('雾')).toBe(CloudFog)
    expect(weatherIcon('霾')).toBe(CloudFog)
  })

  it('复合现象按优先级:雷阵雨不算雪/雨,冻雨算雨', () => {
    expect(weatherIcon('雷阵雨伴有冰雹')).toBe(CloudLightning)
    expect(weatherIcon('冻雨')).toBe(CloudRain)
  })

  it('未识别现象回退 Cloud', () => {
    expect(weatherIcon('浮尘')).toBe(Cloud)
    expect(weatherIcon('')).toBe(Cloud)
  })
})
