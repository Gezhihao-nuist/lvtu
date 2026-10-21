import { describe, expect, it } from 'vitest'
import { cityCover, FALLBACK_COVER } from './city-covers'

describe('cityCover 城市封面三层匹配', () => {
  it('重点城市:精确命中地标图,带后缀写法同样命中', () => {
    const beijing = cityCover('北京')
    expect(beijing).toContain(encodeURIComponent('Beijing'))
    expect(cityCover('北京市')).toBe(beijing)
    expect(cityCover('北京三日游')).toBe(beijing)
  })

  it('未收录城市:按城市名动态生成专属图,URL 编码正确', () => {
    const url = cityCover('安庆')
    expect(url).toContain(encodeURIComponent('安庆'))
    expect(url).toContain('image_size=landscape_16_9')
  })

  it('带行政后缀的未收录城市:剥离后缀后生成', () => {
    const url = cityCover('普洱市')
    expect(url).toContain(encodeURIComponent('普洱'))
    expect(url).not.toContain(encodeURIComponent('普洱市'))
  })

  it('空目的地:返回通用风景兜底', () => {
    expect(cityCover('')).toBe(FALLBACK_COVER)
    expect(cityCover('   ')).toBe(FALLBACK_COVER)
  })

  it('所有封面都是 16:9 横图生成接口', () => {
    for (const dest of ['北京', '成都', '喀什', '安庆', '']) {
      expect(cityCover(dest)).toContain('image_size=landscape_16_9')
    }
  })
})
