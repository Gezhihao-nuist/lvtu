/**
 * 城市封面图:按目的地匹配对应城市的代表性实景图(AI 生成,无版权风险)。
 * 未命中的目的地回退为通用旅行风景图;匹配规则为目的地字符串包含城市名。
 */

const img = (prompt: string) =>
  `https://console.enterprise.trae.cn/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=landscape_16_9`

const CITY_COVERS: Record<string, string> = {
  北京: img(
    'Photorealistic travel photograph of the Forbidden City in Beijing China, golden glazed tile roofs and red palace walls under a clear blue sky, morning light, professional photography, ultra detailed',
  ),
  上海: img(
    'Photorealistic travel photograph of Shanghai Bund skyline at dusk, Oriental Pearl Tower and Lujiazui skyscrapers reflecting on Huangpu River, professional cityscape photography, ultra detailed',
  ),
  成都: img(
    'Photorealistic travel photograph of Kuanzhai Alley in Chengdu China, traditional Sichuan grey-brick courtyards and red lanterns lining a stone-paved street, warm afternoon light, professional photography, ultra detailed',
  ),
  杭州: img(
    'Photorealistic travel photograph of West Lake in Hangzhou China, Leifeng Pagoda across calm water with willow trees and distant misty hills, soft morning light, professional photography, ultra detailed',
  ),
  西安: img(
    'Photorealistic travel photograph of the Giant Wild Goose Pagoda in Xian China at golden hour, ancient brick pagoda with fountain square in foreground, professional photography, ultra detailed',
  ),
  重庆: img(
    'Photorealistic travel photograph of Hongya Cave in Chongqing China at night, traditional stilted buildings stacked on the hillside glowing with warm golden lights, professional photography, ultra detailed',
  ),
  广州: img(
    'Photorealistic travel photograph of Canton Tower in Guangzhou China at blue hour, twisted lattice tower lit with colorful lights above the Pearl River, professional cityscape photography, ultra detailed',
  ),
  深圳: img(
    'Photorealistic travel photograph of Shenzhen skyline with Ping An Finance Centre, modern glass skyscrapers under a clear sky, professional cityscape photography, ultra detailed',
  ),
  苏州: img(
    'Photorealistic travel photograph of a classical Suzhou garden in China, white walls and dark tile roofs around a tranquil pond with rockeries and a moon gate, professional photography, ultra detailed',
  ),
  南京: img(
    'Photorealistic travel photograph of Confucius Temple along Qinhuai River in Nanjing China at dusk, traditional riverside buildings with red lanterns reflecting in the water, professional photography, ultra detailed',
  ),
  厦门: img(
    'Photorealistic travel photograph of Gulangyu Island in Xiamen China, colonial villas among lush green trees facing a blue sea and sky, professional photography, ultra detailed',
  ),
  青岛: img(
    'Photorealistic travel photograph of Zhanqiao Pier in Qingdao China, a long pier extending into the blue sea with a traditional Chinese pavilion at its end, red roofs and green trees along the coast, professional photography, ultra detailed',
  ),
  三亚: img(
    'Photorealistic travel photograph of a tropical beach in Sanya Hainan China, white sand, turquoise water and coconut palm trees under a bright blue sky, professional photography, ultra detailed',
  ),
  桂林: img(
    'Photorealistic travel photograph of the Li River in Guilin China, karst limestone peaks rising over calm water with bamboo rafts in morning mist, professional landscape photography, ultra detailed',
  ),
  昆明: img(
    'Photorealistic travel photograph of Dianchi Lake in Kunming China, calm lake with distant Western Hills and seagulls flying over the water, bright clear day, professional photography, ultra detailed',
  ),
  大理: img(
    'Photorealistic travel photograph of Erhai Lake in Dali Yunnan China, Cangshan mountains reflected in calm blue water with white clouds, professional landscape photography, ultra detailed',
  ),
  拉萨: img(
    'Photorealistic travel photograph of the Potala Palace in Lhasa Tibet, majestic white and red palace on the hill under a deep blue sky, professional photography, ultra detailed',
  ),
  长沙: img(
    'Photorealistic travel photograph of Orange Isle on the Xiang River in Changsha China, lush green island park with the young Mao Zedong statue and city skyline in the distance, professional photography, ultra detailed',
  ),
  武汉: img(
    'Photorealistic travel photograph of the Yellow Crane Tower in Wuhan China, golden multi-tiered pagoda on Snake Hill overlooking the Yangtze River, professional photography, ultra detailed',
  ),
  丽江: img(
    'Photorealistic travel photograph of Lijiang Old Town in Yunnan China, traditional Naxi wooden houses with grey tile roofs along a stone canal, Jade Dragon Snow Mountain in the distance, professional photography, ultra detailed',
  ),
}

const DEFAULT_COVER = img(
  'Photorealistic travel landscape, a winding road toward snow-capped mountains and a turquoise lake at golden hour, professional landscape photography, ultra detailed',
)

/** 按目的地城市取封面图;未收录的城市用通用旅行风景图 */
export function cityCover(destination: string): string {
  for (const [city, url] of Object.entries(CITY_COVERS)) {
    if (destination.includes(city)) return url
  }
  return DEFAULT_COVER
}
