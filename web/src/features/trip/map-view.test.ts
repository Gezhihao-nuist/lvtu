import { describe, expect, it } from 'vitest'
import { parsePolyline } from './map-view'

describe('parsePolyline 路径字符串解析', () => {
  it('标准 lng,lat; 分隔串解析为坐标数组', () => {
    expect(parsePolyline('116.39,39.90;116.40,39.91;117.00,30.00')).toEqual([
      [116.39, 39.9],
      [116.4, 39.91],
      [117.0, 30.0],
    ])
  })

  it('空串 → 空数组', () => {
    expect(parsePolyline('')).toEqual([])
  })

  it('坏段/非数字段被跳过,不影响其余段', () => {
    expect(parsePolyline('116.39,39.90;坏段;abc,def;116.40,39.91')).toEqual([
      [116.39, 39.9],
      [116.4, 39.91],
    ])
  })
})
