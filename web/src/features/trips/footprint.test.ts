import { describe, expect, it } from 'vitest'
import { destinationMatches, uniqueDestinations } from './footprint'

describe('uniqueDestinations 足迹城市去重', () => {
  it('去重且保持首次出现顺序', () => {
    const trips = [
      { destination: '漠河' },
      { destination: '安庆' },
      { destination: '漠河' },
      { destination: '北京' },
      { destination: '安庆' },
    ]
    expect(uniqueDestinations(trips)).toEqual(['漠河', '安庆', '北京'])
  })

  it('忽略空目的地并 trim', () => {
    expect(
      uniqueDestinations([
        { destination: '  成都  ' },
        { destination: '' },
        { destination: '   ' },
      ]),
    ).toEqual(['成都'])
  })

  it('空列表返回空数组', () => {
    expect(uniqueDestinations([])).toEqual([])
  })
})

describe('destinationMatches 城市筛选双向匹配', () => {
  it('「安庆」与「安庆市」互相命中', () => {
    expect(destinationMatches('安庆', '安庆市')).toBe(true)
    expect(destinationMatches('安庆市', '安庆')).toBe(true)
  })

  it('不同城市不命中', () => {
    expect(destinationMatches('漠河', '安庆')).toBe(false)
  })
})
