/**
 * 行程地理优化器(纯函数,无外部依赖,便于单测)。
 *
 * 算法框架取自旅游行程规划问题(TTDP, Tourist Trip Design Problem)文献:
 * 1. Cluster-first(Deitch & Ladany 2000, Tourism Economics;Vathis et al. 2023, C&OR):
 *    先把地理离群的景点重分配到更近的天,从根上避免跨城折返;
 * 2. Route-second(Gavalas et al. 2014, J. Heuristics 综述;Friggstad et al. WSDM 2018):
 *    每天内部精确排序——可动项 ≤8 个时穷举全排列取全局最优(每天通常 3-6 项,
 *    穷举仅毫秒级);代价 = 道路里程 + U 型折返(转向)惩罚;
 *    餐饮/住宿按类目约束钉在原位(Bolzoni et al. SIGSPATIAL 2014);
 * 3. Schedule-third:按点间距离估算交通耗时,重排时间轴。
 */

export interface OptItem {
  type: 'SPOT' | 'FOOD' | 'HOTEL' | 'TRANSPORT';
  title: string;
  startTime: string | null;
  endTime: string | null;
  lng?: number | null;
  lat?: number | null;
  /** 高德 POI 类目串(「风景名胜;世界遗产」),用于室内外判断 */
  poiType?: string | null;
}
export interface OptDay {
  dayIndex: number;
  items: OptItem[];
}

/** 天气判定的最小信息(高德 WeatherCast 结构兼容) */
export interface DayWeatherInfo {
  dayWeather: string;
}

export interface Pt {
  lng: number;
  lat: number;
}

/** 两点球面直线距离(km) */
export function haversineKm(a: Pt, b: Pt): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

const CIRCUITY = 1.3; // 直线距离 → 道路距离的绕行系数(detour index)
const TURN_WEIGHT = 0.25; // 转向惩罚权重(相对里程),U 型折返被显著放大
const EXACT_LIMIT = 8; // 可动项 ≤ 8 时穷举全排列(8! = 40320,毫秒级)
const OUTLIER_KM = 60; // 距本天质心超过该值视为离群点
const REJOIN_KM = 30; // 距另一天质心在该范围内才允许迁入
const MAX_DAY_ITEMS = 6; // 迁入后目标天不超过该条目数(与 AI schema 的 3-6 一致)
const MIN_DAY_ITEMS = 3; // 移出后源天不跌破该条目数
const MAX_SWAP_DELTA_KM = 100; // 天气双赢交换允许的几何代价增量上限

/** 高德 POI 类目 → 室内判断(保守:只命中明确室内类目,其余按户外对待) */
const INDOOR_RE =
  /博物馆|美术馆|纪念馆|图书馆|科技馆|展览馆|陈列馆|商场|购物中心|剧院|影院|茶馆|咖啡馆|咖啡厅|酒吧|室内|水族|海底世界|蜡像馆|会展中心/;
export const isIndoorType = (poiType?: string | null): boolean =>
  !!poiType && INDOOR_RE.test(poiType);

const RAINY_RE = /雨|雪|冰雹/;
export const isRainy = (w: DayWeatherInfo | undefined): boolean =>
  !!w && RAINY_RE.test(w.dayWeather);

function ptOf(it: OptItem): Pt | null {
  return it.lng != null && it.lat != null
    ? { lng: it.lng, lat: it.lat }
    : null;
}

/** 餐饮/住宿按类目约束钉住;无坐标项不参与几何排序 */
const isPinned = (it: OptItem): boolean =>
  it.type === 'FOOD' || it.type === 'HOTEL' || ptOf(it) === null;

/**
 * 完整序列代价:道路里程 + 转向惩罚。
 * 转向惩罚针对 Friggstad et al.(WSDM 2018)指出的「反复重访街区」缺陷:
 * 在中间点的行进方向反转越厉害(夹角越接近 180°),罚得越多,
 * 且罚项与相邻两腿的较短者成正比——短腿处的急转弯只是绕行,
 * 长腿尽头的 U 型折返才是真正的 badcase。
 */
export function sequenceCost(items: OptItem[]): number {
  const pts = items.map(ptOf);
  const coordIdx: number[] = [];
  for (let i = 0; i < pts.length; i++) if (pts[i]) coordIdx.push(i);

  let cost = 0;
  for (let k = 0; k + 1 < coordIdx.length; k++) {
    cost += CIRCUITY * haversineKm(pts[coordIdx[k]!]!, pts[coordIdx[k + 1]!]!);
  }
  // 转向惩罚(近似平面坐标,经度按 cos(纬度) 修正)
  for (let k = 1; k + 1 < coordIdx.length; k++) {
    const a = pts[coordIdx[k - 1]!]!;
    const b = pts[coordIdx[k]!]!;
    const c = pts[coordIdx[k + 1]!]!;
    const cosLat = Math.cos((b.lat * Math.PI) / 180);
    const v1x = (b.lng - a.lng) * cosLat;
    const v1y = b.lat - a.lat;
    const v2x = (c.lng - b.lng) * cosLat;
    const v2y = c.lat - b.lat;
    const n1 = Math.hypot(v1x, v1y);
    const n2 = Math.hypot(v2x, v2y);
    if (n1 === 0 || n2 === 0) continue;
    const cosTheta = (v1x * v2x + v1y * v2y) / (n1 * n2);
    const shorter = Math.min(haversineKm(a, b), haversineKm(b, c));
    cost += TURN_WEIGHT * ((1 - cosTheta) / 2) * CIRCUITY * shorter;
  }
  return cost;
}

/** 把候选顺序填回可动槽位后求代价 */
function costWithOrder(
  items: OptItem[],
  slotPos: number[],
  order: OptItem[],
): number {
  const tmp = items.slice();
  slotPos.forEach((pos, k) => {
    tmp[pos] = order[k]!;
  });
  return sequenceCost(tmp);
}

/**
 * Route-second:日内精确排序。
 * 钉住项原位不动;可动项 ≤ EXACT_LIMIT 时穷举全排列取全局最优,
 * 更大实例退化为最近邻 + 2-opt 启发式(实践中几乎不会触发)。
 */
export function optimizeDayOrder(items: OptItem[]): void {
  const slotPos: number[] = [];
  const movable: OptItem[] = [];
  items.forEach((it, i) => {
    if (!isPinned(it)) {
      slotPos.push(i);
      movable.push(it);
    }
  });
  const m = movable.length;
  if (m < 2) return;

  let bestOrder = movable.slice();
  let bestCost = costWithOrder(items, slotPos, bestOrder);

  if (m <= EXACT_LIMIT) {
    // 全排列穷举(交换法),取多目标代价最小的顺序
    const arr = movable.slice();
    const dfs = (k: number): void => {
      if (k === m) {
        const c = costWithOrder(items, slotPos, arr);
        if (c + 1e-9 < bestCost) {
          bestCost = c;
          bestOrder = arr.slice();
        }
        return;
      }
      for (let j = k; j < m; j++) {
        [arr[k], arr[j]] = [arr[j]!, arr[k]!];
        dfs(k + 1);
        [arr[k], arr[j]] = [arr[j]!, arr[k]!];
      }
    };
    dfs(0);
  } else {
    // 兜底:最近邻构造 + 2-opt 改进(以 sequenceCost 为准)
    const remaining = movable.slice(1);
    const route = [movable[0]!];
    while (remaining.length) {
      const last = ptOf(route[route.length - 1]!)!;
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(last, ptOf(remaining[i]!)!);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      route.push(remaining.splice(bi, 1)[0]!);
    }
    let c = costWithOrder(items, slotPos, route);
    if (c + 1e-9 < bestCost) {
      bestCost = c;
      bestOrder = route.slice();
    }
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      for (let i = 1; i < route.length - 1; i++) {
        for (let j = i + 1; j < route.length; j++) {
          const candidate = [
            ...route.slice(0, i),
            ...route.slice(i, j + 1).reverse(),
            ...route.slice(j + 1),
          ];
          const cc = costWithOrder(items, slotPos, candidate);
          if (cc + 1e-9 < bestCost) {
            bestCost = cc;
            bestOrder = candidate.slice();
            route.splice(0, route.length, ...candidate);
            improved = true;
          }
        }
      }
    }
  }

  slotPos.forEach((pos, k) => {
    items[pos] = bestOrder[k]!;
  });
}

/**
 * Cluster-first:跨天离群点重分配(保守版)。
 * 景点距本天质心超过 OUTLIER_KM、且距另一天质心在 REJOIN_KM 内时,
 * 把它迁到更近的天;受 MAX/MIN_DAY_ITEMS 约束,最多两轮防振荡。
 */
export function rebalanceDays(
  days: OptDay[],
  warn?: (msg: string) => void,
): void {
  if (days.length < 2) return;

  const centroid = (items: OptItem[]): Pt | null => {
    const spots = items
      .filter((it) => it.type === 'SPOT')
      .map(ptOf)
      .filter((p): p is Pt => p !== null);
    const all = items.map(ptOf).filter((p): p is Pt => p !== null);
    const use = spots.length ? spots : all;
    if (!use.length) return null;
    const sum = use.reduce((s, p) => ({ lng: s.lng + p.lng, lat: s.lat + p.lat }), {
      lng: 0,
      lat: 0,
    });
    return { lng: sum.lng / use.length, lat: sum.lat / use.length };
  };

  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    const centroids = days.map((d) => centroid(d.items));
    outer: for (let d = 0; d < days.length; d++) {
      const cOwn = centroids[d];
      if (!cOwn) continue;
      const items = days[d]!.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]!;
        if (it.type !== 'SPOT') continue;
        const p = ptOf(it);
        if (!p) continue;
        const dOwn = haversineKm(p, cOwn);
        if (dOwn <= OUTLIER_KM) continue;
        let bestD = -1;
        let bestKm = Infinity;
        for (let d2 = 0; d2 < days.length; d2++) {
          if (d2 === d || !centroids[d2]) continue;
          const dd = haversineKm(p, centroids[d2]!);
          if (dd < bestKm) {
            bestKm = dd;
            bestD = d2;
          }
        }
        if (bestD < 0 || bestKm > REJOIN_KM) continue;
        if (days[bestD]!.items.length >= MAX_DAY_ITEMS) continue;
        if (items.length <= MIN_DAY_ITEMS) continue;
        items.splice(i, 1);
        days[bestD]!.items.push(it);
        warn?.(
          `景点「${it.title}」距第 ${d + 1} 天区域 ${Math.round(dOwn)}km,已调整到第 ${bestD + 1} 天`,
        );
        moved = true;
        break outer; // 质心已变,重开一轮
      }
    }
    if (!moved) return;
  }
}

/**
 * 天气硬联动(双赢交换):雨天里的户外景点 ↔ 无雨天里的室内景点。
 * AI 提示词只做软引导,这里给确定性兜底:只交换「错配」的点
 * (雨天的户外点 / 晴天的室内点),两天条目数 1 换 1 不变;
 * 几何代价按最近邻插入近似,增量 ≤ MAX_SWAP_DELTA_KM 才执行,
 * 最多 3 轮防振荡。交换后由调用方重新做日内排序与时间轴。
 */
export function weatherAwareSwap(
  days: OptDay[],
  weatherByDay: Map<number, DayWeatherInfo>,
  warn?: (msg: string) => void,
): void {
  /** p 到 items 中最近有坐标点的距离(km) */
  const nearestKm = (p: Pt, items: OptItem[]): number => {
    let best = Infinity;
    for (const it of items) {
      const q = ptOf(it);
      if (q) best = Math.min(best, haversineKm(p, q));
    }
    return best;
  };

  for (let round = 0; round < 3; round++) {
    let swapped = false;
    outer: for (const rainDay of days) {
      if (!isRainy(weatherByDay.get(rainDay.dayIndex))) continue;
      const outdoor = rainDay.items.filter(
        (it) => it.type === 'SPOT' && ptOf(it) && !isIndoorType(it.poiType),
      );
      if (!outdoor.length) continue;
      for (const fairDay of days) {
        if (fairDay === rainDay) continue;
        const wFair = weatherByDay.get(fairDay.dayIndex);
        if (!wFair || isRainy(wFair)) continue;
        const indoor = fairDay.items.filter(
          (it) => it.type === 'SPOT' && ptOf(it) && isIndoorType(it.poiType),
        );
        if (!indoor.length) continue;
        // 选几何代价增量最小的一对
        let bestPair: [OptItem, OptItem] | null = null;
        let bestDelta = Infinity;
        for (const x of outdoor) {
          const px = ptOf(x)!;
          for (const y of indoor) {
            const py = ptOf(y)!;
            const delta =
              nearestKm(px, fairDay.items) +
              nearestKm(py, rainDay.items) -
              nearestKm(px, rainDay.items) -
              nearestKm(py, fairDay.items);
            if (delta < bestDelta) {
              bestDelta = delta;
              bestPair = [x, y];
            }
          }
        }
        if (!bestPair || bestDelta > MAX_SWAP_DELTA_KM) continue;
        const [x, y] = bestPair;
        rainDay.items.splice(rainDay.items.indexOf(x), 1, y);
        fairDay.items.splice(fairDay.items.indexOf(y), 1, x);
        warn?.(
          `天气联动:「${x.title}」(户外)与「${y.title}」(室内)已按天气互换到更合适的日期`,
        );
        swapped = true;
        break outer;
      }
    }
    if (!swapped) return;
  }
}

/**
 * Schedule-third:按顺序重排一天的时间轴。
 * 项间间隔 = 交通耗时估算(步行 4.5km/h / 车行 27km/h,含绕行系数)
 * + 10 分钟缓冲,钳制在 15-90 分钟;无坐标时回退 30 分钟固定缓冲。
 */
export function reflowDayTimes(items: OptItem[]): void {
  const defaultDur: Record<OptItem['type'], number> = {
    SPOT: 120,
    FOOD: 60,
    TRANSPORT: 45,
    HOTEL: 0,
  };
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const toHHmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  let cursor = items[0]?.startTime ? toMin(items[0].startTime) : 8 * 60 + 30;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    let dur = defaultDur[it.type];
    if (it.startTime && it.endTime) {
      const d = toMin(it.endTime) - toMin(it.startTime);
      if (d >= 15 && d <= 360) dur = d;
    }
    it.startTime = toHHmm(cursor);
    it.endTime = it.type === 'HOTEL' ? null : toHHmm(cursor + dur);
    cursor += dur;
    const next = items[i + 1];
    if (next) {
      const a = ptOf(it);
      const b = ptOf(next);
      let gap = 30;
      if (a && b) {
        const km = CIRCUITY * haversineKm(a, b);
        const speed = km < 2 ? 4.5 : 27; // 短腿步行,长腿按市内车行/公共交通
        gap = Math.min(90, Math.max(15, Math.round((km / speed) * 60) + 10));
      }
      cursor += gap;
    }
  }
}
