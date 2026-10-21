/**
 * 城市封面图:输入任何中国城市,卡片都显示对应城市的照片(AI 生成,无版权风险)。
 * 三层匹配:
 *   1. 重点城市精确地标(下面收录的 ~90 个,提示词写到具体景点)
 *   2. 其余城市按城市名动态生成专属照片(全覆盖,无遗漏)
 *   3. 目的地为空时的通用旅行风景兜底
 * 匹配规则:目的地字符串包含城市名(如「大理白族自治州」命中「大理」)。
 */

const img = (prompt: string) =>
  `https://console.enterprise.trae.cn/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=landscape_16_9`

/** 重点城市:精确到地标的定制提示词 */
const landmark = (place: string) =>
  img(`Photorealistic travel photograph of ${place}, China, iconic scenery, professional travel photography, ultra detailed`)

const CITY_COVERS: Record<string, string> = {
  // ── 直辖市 / 特别行政区 / 热门一线 ──────────────────────────
  北京: img(
    'Photorealistic travel photograph of the Forbidden City in Beijing China, golden glazed tile roofs and red palace walls under a clear blue sky, morning light, professional photography, ultra detailed',
  ),
  上海: img(
    'Photorealistic travel photograph of Shanghai Bund skyline at dusk, Oriental Pearl Tower and Lujiazui skyscrapers reflecting on Huangpu River, professional cityscape photography, ultra detailed',
  ),
  天津: landmark('Tianjin Eye ferris wheel over the Hai River at dusk, Tianjin'),
  重庆: img(
    'Photorealistic travel photograph of Hongya Cave in Chongqing China at night, traditional stilted buildings stacked on the hillside glowing with warm golden lights, professional photography, ultra detailed',
  ),
  香港: landmark('Victoria Harbour skyline at night viewed from Tsim Sha Tsui, Hong Kong'),
  澳门: landmark('Ruins of Saint Paul facade, Macau'),
  广州: img(
    'Photorealistic travel photograph of Canton Tower in Guangzhou China at blue hour, twisted lattice tower lit with colorful lights above the Pearl River, professional cityscape photography, ultra detailed',
  ),
  深圳: img(
    'Photorealistic travel photograph of Shenzhen skyline with Ping An Finance Centre, modern glass skyscrapers under a clear sky, professional cityscape photography, ultra detailed',
  ),

  // ── 各省会 ──────────────────────────────────────────────
  成都: img(
    'Photorealistic travel photograph of Kuanzhai Alley in Chengdu China, traditional Sichuan grey-brick courtyards and red lanterns lining a stone-paved street, warm afternoon light, professional photography, ultra detailed',
  ),
  杭州: img(
    'Photorealistic travel photograph of West Lake in Hangzhou China, Leifeng Pagoda across calm water with willow trees and distant misty hills, soft morning light, professional photography, ultra detailed',
  ),
  西安: img(
    'Photorealistic travel photograph of the Giant Wild Goose Pagoda in Xian China at golden hour, ancient brick pagoda with fountain square in foreground, professional photography, ultra detailed',
  ),
  南京: img(
    'Photorealistic travel photograph of Confucius Temple along Qinhuai River in Nanjing China at dusk, traditional riverside buildings with red lanterns reflecting in the water, professional photography, ultra detailed',
  ),
  武汉: img(
    'Photorealistic travel photograph of the Yellow Crane Tower in Wuhan China, golden multi-tiered pagoda on Snake Hill overlooking the Yangtze River, professional photography, ultra detailed',
  ),
  长沙: landmark('Orange Isle on the Xiang River with the young Mao Zedong statue, Changsha'),
  郑州: landmark('Shaolin Temple pagoda forest at the foot of Songshan Mountain, Zhengzhou Henan'),
  合肥: landmark('Sanhe ancient town with canals and white-wall black-tile houses, Hefei Anhui'),
  南昌: landmark('Tengwang Pavilion by the Gan River at dusk, Nanchang Jiangxi'),
  福州: landmark('Sanfang Qixiang historic lanes with white walls and saddle roofs, Fuzhou Fujian'),
  贵阳: landmark('Jiaxiu Pavilion over the Nanming River at night, Guiyang Guizhou'),
  昆明: landmark('Dianchi Lake with seagulls over the water and Western Hills in distance, Kunming Yunnan'),
  兰州: landmark('Zhongshan Iron Bridge over the Yellow River, Lanzhou Gansu'),
  西宁: landmark('Kumbum Taer Monastery golden stupas, Xining Qinghai'),
  银川: landmark('Zhenbeipu Western Film City old fortress walls at sunset, Yinchuan Ningxia'),
  乌鲁木齐: landmark('Heavenly Lake Tianchi among snow-capped Tianshan peaks, Urumqi Xinjiang'),
  呼和浩特: landmark('Dazhao Temple with grassland in the distance, Hohhot Inner Mongolia'),
  拉萨: img(
    'Photorealistic travel photograph of the Potala Palace in Lhasa Tibet, majestic white and red palace on the hill under a deep blue sky, professional photography, ultra detailed',
  ),
  南宁: landmark('Qingxiu Mountain lush green hills and pagoda, Nanning Guangxi'),
  海口: landmark('Qilou old street with colonial arcade buildings, Haikou Hainan'),
  太原: landmark('Jinci Temple ancient wooden halls and cypress trees, Taiyuan Shanxi'),
  石家庄: landmark('Zhaozhou Bridge, the ancient stone arch bridge over the Xiao River, Shijiazhuang Hebei'),
  济南: landmark('Baotu Spring park with three spring jets, Jinan Shandong'),
  沈阳: landmark('Shenyang Imperial Palace red walls and golden roofs, Shenyang Liaoning'),
  长春: landmark('Jingyuetan forest lake in autumn colors, Changchun Jilin'),
  哈尔滨: landmark('Saint Sophia Cathedral with snow and ice lanterns in winter, Harbin Heilongjiang'),

  // ── 热门旅游名城 ─────────────────────────────────────────
  苏州: img(
    'Photorealistic travel photograph of a classical Suzhou garden in China, white walls and dark tile roofs around a tranquil pond with rockeries and a moon gate, professional photography, ultra detailed',
  ),
  厦门: img(
    'Photorealistic travel photograph of Gulangyu Island in Xiamen China, colonial villas among lush green trees facing a blue sea and sky, professional photography, ultra detailed',
  ),
  青岛: img(
    'Photorealistic travel photograph of Zhanqiao Pier in Qingdao China, a long pier extending into the blue sea with a traditional Chinese pavilion at its end, red roofs and green trees along the coast, professional photography, ultra detailed',
  ),
  大连: landmark('Xinghai Bay seaside skyline and cross-sea bridge, Dalian Liaoning'),
  宁波: landmark('Old Bund riverside historic buildings, Ningbo Zhejiang'),
  无锡: landmark('Yuantouzhu Turtle Head Isle cherry blossoms by Taihu Lake, Wuxi Jiangsu'),
  扬州: landmark('Slender West Lake Five Pavilion Bridge, Yangzhou Jiangsu'),
  绍兴: landmark('black awning boats on the canal in Lu Xun hometown, Shaoxing Zhejiang'),
  嘉兴: landmark('Wuzhen water town canals and wooden houses at dawn, Jiaxing Zhejiang'),
  舟山: landmark('Putuoshan island temple by the sea, Zhoushan Zhejiang'),
  温州: landmark('Yandang Mountain peaks and waterfalls, Wenzhou Zhejiang'),
  金华: landmark('Hengdian World Studios palace set, Jinhua Zhejiang'),
  泉州: landmark('Kaiyuan Temple twin stone pagodas, Quanzhou Fujian'),
  潮州: landmark('Guangji Bridge over the Han River, Chaozhou Guangdong'),
  珠海: landmark('Fisher Girl statue along Qinglv Road seaside, Zhuhai Guangdong'),
  佛山: landmark('Foshan Ancestral Temple ornate roof carvings, Foshan Guangdong'),
  东莞: landmark('Keyuan classical garden, Dongguan Guangdong'),
  汕头: landmark('Small Park district with qilou arcade streets, Shantou Guangdong'),
  惠州: landmark('Huizhou West Lake pagoda and causeway, Huizhou Guangdong'),
  肇庆: landmark('Seven Star Crags limestone peaks over Star Lake, Zhaoqing Guangdong'),
  韶关: landmark('Danxiashan red sandstone peaks, Shaoguan Guangdong'),
  三亚: img(
    'Photorealistic travel photograph of a tropical beach in Sanya Hainan China, white sand, turquoise water and coconut palm trees under a bright blue sky, professional photography, ultra detailed',
  ),
  北海: landmark('Silver Beach white sand and blue sea, Beihai Guangxi'),
  桂林: img(
    'Photorealistic travel photograph of the Li River in Guilin China, karst limestone peaks rising over calm water with bamboo rafts in morning mist, professional landscape photography, ultra detailed',
  ),
  大理: img(
    'Photorealistic travel photograph of Erhai Lake in Dali Yunnan China, Cangshan mountains reflected in calm blue water with white clouds, professional landscape photography, ultra detailed',
  ),
  丽江: img(
    'Photorealistic travel photograph of Lijiang Old Town in Yunnan China, traditional Naxi wooden houses with grey tile roofs along a stone canal, Jade Dragon Snow Mountain in the distance, professional photography, ultra detailed',
  ),
  香格里拉: landmark('Songzanlin Monastery golden roofs on the hillside, Shangri-La Yunnan'),
  西双版纳: landmark('tropical rainforest and Dai-style golden pagoda, Xishuangbanna Yunnan'),
  张家界: landmark('Wulingyuan sandstone pillar peaks in mist, Zhangjiajie Hunan'),
  湘西: landmark('Fenghuang Ancient Town stilted houses along the Tuo River at night, Xiangxi Hunan'),
  岳阳: landmark('Yueyang Tower by Dongting Lake, Yueyang Hunan'),
  衡阳: landmark('Mount Heng southern sacred mountain temples in clouds, Hengyang Hunan'),
  黄山: landmark('Huangshan Yellow Mountain pine trees on granite peaks above sea of clouds, Anhui'),
  池州: landmark('Jiuhua Mountain Buddhist temples on misty peaks, Chizhou Anhui'),
  九江: landmark('Lushan Mountain waterfalls and misty peaks, Jiujiang Jiangxi'),
  上饶: landmark('Wuyuan rapeseed flower terraces and white-wall villages, Shangrao Jiangxi'),
  吉安: landmark('Jinggangshan revolutionary mountain peaks, Jian Jiangxi'),
  景德镇: landmark('ancient kiln and blue-and-white porcelain workshops, Jingdezhen Jiangxi'),
  泰山: landmark('Mount Tai stone steps and South Heaven Gate above clouds, Taian Shandong'),
  烟台: landmark('Penglai Pavilion on the cliff over the sea, Yantai Shandong'),
  威海: landmark('Chengshantou coastline where the sun rises over the sea, Weihai Shandong'),
  济宁: landmark('Confucius Temple ancient cypresses and stone steles in Qufu, Jining Shandong'),
  秦皇岛: landmark('Shanhaiguan Great Wall meeting the sea at Laolongtou, Qinhuangdao Hebei'),
  承德: landmark('Chengde Mountain Resort pavilions by the lake, Chengde Hebei'),
  大同: landmark('Yungang Grottoes giant Buddha statues, Datong Shanxi'),
  晋中: landmark('Pingyao Ancient City walls and Ming-Qing streets, Jinzhong Shanxi'),
  延安: landmark('Yanan Pagoda Hill with the revolutionary pagoda at dusk, Yanan Shaanxi'),
  洛阳: landmark('Longmen Grottoes giant Vairocana Buddha carved in the cliff, Luoyang Henan'),
  开封: landmark('Millennium City Park Song-dynasty style rainbow bridge, Kaifeng Henan'),
  十堰: landmark('Wudang Mountain golden hall on the misty peak, Shiyan Hubei'),
  宜昌: landmark('Three Gorges Dam on the Yangtze River, Yichang Hubei'),
  襄阳: landmark('Gulongzhong thatched cottages in the hills, Xiangyang Hubei'),
  恩施: landmark('Enshi Grand Canyon cliff pillars and plank walkways, Enshi Hubei'),
  乐山: landmark('Leshan Giant Buddha carved in the riverside cliff, Leshan Sichuan'),
  阿坝: landmark('Jiuzhaigou colorful turquoise lakes and waterfalls in autumn, Aba Sichuan'),
  甘孜: landmark('Daocheng Yading snow peaks and Milk Lake, Ganzi Sichuan'),
  眉山: landmark('Sansu Temple gardens, Meishan Sichuan'),
  敦煌: landmark('Mingsha Sand Dunes and Crescent Lake at sunset, Dunhuang Gansu'),
  喀什: landmark('Kashgar Old Town earthen alleyways and carved wooden balconies, Xinjiang'),
  伊犁: landmark('Nalati grassland with horses under Tianshan snow peaks, Yili Xinjiang'),
  呼伦贝尔: landmark('endless green Hulunbuir grassland with winding river and sheep, Inner Mongolia'),
  延边: landmark('Changbai Mountain Heaven Lake in the volcanic crater, Yanbian Jilin'),
  威海卫: landmark('Liugong Island naval fort by the sea, Weihai Shandong'),
}

const DEFAULT_COVER = img(
  'Photorealistic travel landscape, a winding road toward snow-capped mountains and a turquoise lake at golden hour, professional landscape photography, ultra detailed',
)

/** 封面图加载失败时的最终兜底(通用风景,几乎不会失败) */
export const FALLBACK_COVER = DEFAULT_COVER

/** 去掉「北京市」「大理白族自治州」这类后缀,让动态提示词更干净 */
function normalizePlaceName(raw: string): string {
  return raw
    .trim()
    .replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治州|自治区|地区|盟|省|市)$/u, '')
}

/** 目的地 → 封面图:重点城市给地标图,其余城市按名字动态生成,空目的地用通用风景 */
export function cityCover(destination: string): string {
  const d = destination.trim()
  for (const [city, url] of Object.entries(CITY_COVERS)) {
    if (d.includes(city)) return url
  }
  const place = normalizePlaceName(d)
  if (place) {
    return img(
      `Photorealistic travel photograph of ${place}, China — iconic landmark and beautiful cityscape, professional travel photography, ultra detailed`,
    )
  }
  return DEFAULT_COVER
}
