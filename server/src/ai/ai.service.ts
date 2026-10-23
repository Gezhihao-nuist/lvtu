/**
 * AI 行程规划服务。
 *
 * Mock 模式:当环境变量 DEEPSEEK_API_KEY 为空时,不调用真实大模型,
 * 改为生成一份确定性的模拟行程(见 buildMockPlan),并走与真实模式
 * 完全相同的 Zod 校验、坐标补全与落库流程,SSE 事件照常推送,
 * 保证无 key 也能完整演示。
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { z } from 'zod';
import { GeoService, type WeatherCast } from '../geo/geo.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  haversineKm,
  optimizeDayOrder,
  rebalanceDays,
  reflowDayTimes,
  weatherAwareSwap,
} from './optimizer.js';

export type SseEmit = (data: Record<string, unknown>) => void;

const SYSTEM_PROMPT = `你是专业旅行规划师。根据用户给出的目的地、天数、日期与偏好,输出 JSON 格式行程。
输出 schema:{"days":[{"dayIndex":0,"items":[{"type":"SPOT"|"FOOD"|"HOTEL"|"TRANSPORT","title":string,"poiName":string|null,"startTime":"HH:mm"|null,"endTime":"HH:mm"|null,"cost":number|null,"note":string|null}]}]}
要求:每天 3-6 项;节奏合理(景点→午餐→景点→晚餐);**地理位置就近原则:同一天的景点必须集中在同一区域(同一城区/县城/景区),按游览顺序就近排列,不走回头路;相隔较远的区域分到不同天;餐厅要选在当天游览区域的附近**;**若提供了天气预报:降雨/降雪天优先安排室内景点(博物馆/美术馆/商场/茶馆等),晴天优先安排户外景点,并在对应条目的 note 里自然地提一句天气贴士(如带伞、防晒),不要生硬罗列**;poiName 尽量使用高德地图能搜到的正式地名;绝不输出经纬度;note 用一两句口语化中文说清看点或贴士,避免 AI 腔,不要出现「赋能」「沉浸式」这类词;dayIndex 从 0 开始;只输出 JSON,不要输出任何解释。`;

const itemSchema = z.object({
  type: z.enum(['SPOT', 'FOOD', 'HOTEL', 'TRANSPORT']),
  title: z.string().min(1),
  poiName: z.string().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  cost: z.number().nullable(),
  note: z.string().nullable(),
});

const planSchema = z.object({
  days: z.array(
    z.object({
      dayIndex: z.number().int().nonnegative(),
      items: z.array(itemSchema).min(1),
    }),
  ),
});

type PlanItem = z.infer<typeof itemSchema> & {
  poiId?: string | null;
  poiType?: string | null;
  rating?: number | null;
  lng?: number | null;
  lat?: number | null;
};
type Plan = { days: { dayIndex: number; items: PlanItem[] }[] };

/** 简单并发池:最多 limit 个任务同时执行 */
async function mapLimit<T>(
  arr: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, arr.length) },
    async () => {
      while (i < arr.length) {
        const item = arr[i++];
        await fn(item);
      }
    },
  );
  await Promise.all(workers);
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly cfg: ConfigService,
  ) {}

  /** 生成整份 AI 行程,SSE 推送 progress/done/error 事件;signal 中断(客户端断开)则不再落库 */
  async generate(
    tripId: string,
    preferences: string | undefined,
    emit: SseEmit,
    signal?: AbortSignal,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { days: true },
    });
    if (!trip) {
      emit({ type: 'error', message: '行程不存在' });
      return;
    }
    emit({ type: 'progress', text: '正在规划行程…' });
    const start = trip.startDate.toISOString().slice(0, 10);
    const end = trip.endDate.toISOString().slice(0, 10);
    const weatherByDay = await this.buildWeatherMap(
      trip.destination,
      trip.startDate,
      trip.days.length,
    );
    const weatherHint = this.formatWeatherHint(weatherByDay);
    const userPrompt =
      `目的地:${trip.destination}\n` +
      `日期:${start} 至 ${end},共 ${trip.days.length} 天\n` +
      weatherHint +
      `偏好:${preferences?.trim() || '无特别偏好'}\n` +
      `请输出完整行程 JSON。`;
    emit({ type: 'progress', text: 'AI 正在生成行程方案…' });
    let plan: Plan | null = null;
    try {
      plan = await this.producePlan(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        () => this.buildMockPlan(trip.destination, trip.days.length),
        emit,
        signal,
      );
    } catch (e) {
      emit({
        type: 'error',
        message: e instanceof Error ? e.message : '生成失败,请重试',
      });
      return;
    }
    if (!plan) {
      emit({ type: 'error', message: '生成失败,请重试' });
      return;
    }
    await this.finalize(
      tripId,
      trip.destination,
      plan,
      preferences?.trim() || '生成行程',
      emit,
      weatherByDay,
      signal,
    );
  }

  /** 基于当前行程与用户指令整体重生成行程 */
  async chat(
    tripId: string,
    message: string,
    emit: SseEmit,
    signal?: AbortSignal,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { items: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!trip) {
      emit({ type: 'error', message: '行程不存在' });
      return;
    }
    emit({ type: 'progress', text: '正在理解你的调整需求…' });
    const current = {
      destination: trip.destination,
      days: trip.days.map((d) => ({
        dayIndex: d.dayIndex,
        items: d.items.map((i) => ({
          type: i.type,
          title: i.title,
          startTime: i.startTime,
          endTime: i.endTime,
          cost: i.cost === null ? null : Number(i.cost),
          note: i.note,
        })),
      })),
    };
    const weatherByDay = await this.buildWeatherMap(
      trip.destination,
      trip.startDate,
      trip.days.length,
    );
    const weatherHint = this.formatWeatherHint(weatherByDay);
    const userPrompt =
      `当前行程:${JSON.stringify(current)}\n` +
      weatherHint +
      `用户指令:${message}\n` +
      `请输出调整后的完整行程 JSON,schema 不变。`;
    emit({ type: 'progress', text: 'AI 正在调整行程…' });
    let plan: Plan | null = null;
    try {
      plan = await this.producePlan(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        () => this.buildMockPlan(trip.destination, trip.days.length),
        emit,
        signal,
      );
    } catch (e) {
      emit({
        type: 'error',
        message: e instanceof Error ? e.message : '生成失败,请重试',
      });
      return;
    }
    if (!plan) {
      emit({ type: 'error', message: '生成失败,请重试' });
      return;
    }
    await this.finalize(
      tripId,
      trip.destination,
      plan,
      message,
      emit,
      weatherByDay,
      signal,
    );
  }

  /** 坐标补全(可选)+ 事务落库 + done 事件;落库前最后确认客户端仍在线 */
  private async finalize(
    tripId: string,
    destination: string,
    plan: Plan,
    userText: string,
    emit: SseEmit,
    weatherByDay?: Map<number, WeatherCast>,
    signal?: AbortSignal,
  ) {
    if (this.amapKey) {
      emit({ type: 'progress', text: '正在补全地点坐标…' });
      await this.enrichCoordinates(plan, destination);
      emit({ type: 'progress', text: '正在按地理位置优化游览顺序…' });
      this.optimizePlan(plan, weatherByDay);
    }
    if (signal?.aborted) {
      this.logger.log('客户端已断开,放弃落库(行程保持原样)');
      return;
    }
    emit({ type: 'progress', text: '正在写入行程…' });
    const { dayCount, itemCount } = await this.applyPlan(
      tripId,
      plan,
      userText,
    );
    emit({ type: 'done', dayCount, itemCount });
  }

  /**
   * 逐日天气预报 Map(dayIndex → 当日预报)。
   * 高德预报仅覆盖当天 + 未来 3 天,窗口外的天不进 Map;
   * 未配置 Key / 接口失败时静默降级为空 Map,不影响生成主流程。
   */
  private async buildWeatherMap(
    destination: string,
    startDate: Date,
    dayCount: number,
  ): Promise<Map<number, WeatherCast>> {
    const result = new Map<number, WeatherCast>();
    if (!this.amapKey) return result;
    try {
      const casts = await this.geo.getWeather(destination);
      const byDate = new Map(casts.map((c) => [c.date, c]));
      for (let i = 0; i < dayCount; i++) {
        const key = new Date(startDate.getTime() + i * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const c = byDate.get(key);
        if (c) result.set(i, c);
      }
    } catch (e) {
      this.logger.warn(
        `天气预报获取失败,按无天气信息继续: ${e instanceof Error ? e.message : e}`,
      );
    }
    return result;
  }

  /** 把天气 Map 格式化成提示词文本;空 Map → 空串 */
  private formatWeatherHint(weatherByDay: Map<number, WeatherCast>): string {
    const lines: string[] = [];
    for (const [i, c] of [...weatherByDay.entries()].sort((a, b) => a[0] - b[0])) {
      const weather =
        c.dayWeather === c.nightWeather
          ? c.dayWeather
          : `${c.dayWeather}转${c.nightWeather}`;
      lines.push(
        `第${i + 1}天 ${c.date.slice(5)}:${weather} ${c.nightTemp}~${c.dayTemp}°C`,
      );
    }
    return lines.length ? `天气预报:\n${lines.join('\n')}\n` : '';
  }

  /** 逐日天气预报提示词文本(buildWeatherMap + formatWeatherHint 的组合,保留以便测试) */
  private async buildWeatherHint(
    destination: string,
    startDate: Date,
    dayCount: number,
  ): Promise<string> {
    return this.formatWeatherHint(
      await this.buildWeatherMap(destination, startDate, dayCount),
    );
  }

  /** 调用大模型产出经容错链校验的行程;Mock 模式直接返回模拟行程 */
  private async producePlan(
    messages: OpenAI.ChatCompletionMessageParam[],
    mockFactory: () => Plan,
    emit: SseEmit,
    signal?: AbortSignal,
  ): Promise<Plan | null> {
    if (!this.deepseekKey) {
      emit({ type: 'progress', text: '未配置模型 Key,使用内置演示行程' });
      // 走同一套 Zod 校验,保证流程一致
      return this.parsePlan(JSON.stringify(mockFactory())).plan;
    }
    try {
      const content = await this.callModel(messages, signal);
      let { plan, error } = this.parsePlan(content);
      if (!plan) {
        emit({ type: 'progress', text: '行程校验未通过,正在自动修复…' });
        const repaired = await this.callModel(
          [
            {
              role: 'system',
              content:
                '之前输出的行程 JSON 未通过校验。请修复后只输出修复后的完整 JSON,不要输出解释。',
            },
            {
              role: 'user',
              content: `原始输出:\n${content}\n\n校验错误:\n${error ?? '未知'}`,
            },
          ],
          signal,
        );
        ({ plan } = this.parsePlan(repaired));
      }
      return plan;
    } catch (e) {
      this.logger.error(
        `DeepSeek 调用失败: ${e instanceof Error ? e.message : e}`,
      );
      throw new Error(this.friendlyApiError(e));
    }
  }

  /** 把模型 API 异常翻译成用户可操作的提示 */
  private friendlyApiError(e: unknown): string {
    const name = (e as { name?: string } | null)?.name ?? '';
    const msg = e instanceof Error ? e.message : '';
    if (name.includes('Timeout') || /timed?\s*out/i.test(msg)) {
      return 'AI 响应超时,请重试';
    }
    const status = (e as { status?: number } | null)?.status;
    switch (status) {
      case 401:
        return 'DeepSeek Key 无效,请检查 server/.env 的 DEEPSEEK_API_KEY';
      case 402:
        return 'DeepSeek 账户余额不足,请前往 platform.deepseek.com 充值后重试';
      case 429:
        return 'DeepSeek 请求过于频繁,请稍后重试';
      default:
        if (status && status >= 500) {
          return 'DeepSeek 服务暂时不可用,请稍后重试';
        }
        return '生成失败,请重试';
    }
  }

  /** 解析并 Zod 校验模型输出;直接 parse 失败时尝试提取 ```json 代码块 */
  private parsePlan(raw: string): { plan: Plan | null; error: string | null } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const block = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!block) return { plan: null, error: '输出不是合法 JSON' };
      try {
        parsed = JSON.parse(block[1]);
      } catch {
        return { plan: null, error: '输出不是合法 JSON' };
      }
    }
    const result = planSchema.safeParse(parsed);
    if (!result.success) {
      return {
        plan: null,
        error: result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      };
    }
    return { plan: result.data as Plan, error: null };
  }

  /** 调用 DeepSeek(非流式,等待完整 JSON 返回;90 秒超时兜底 + 客户端断开即中断,防止 API 挂起导致 SSE 永不结束) */
  private async callModel(
    messages: OpenAI.ChatCompletionMessageParam[],
    signal?: AbortSignal,
  ): Promise<string> {
    const completion = await this.getClient().chat.completions.create(
      {
        model: this.cfg.get('DEEPSEEK_MODEL') ?? 'deepseek-chat',
        messages,
        response_format: { type: 'json_object' },
      },
      {
        signal: signal
          ? AbortSignal.any([AbortSignal.timeout(90_000), signal])
          : AbortSignal.timeout(90_000),
      },
    );
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('模型返回为空');
    return content;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.deepseekKey,
        baseURL: this.cfg.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com',
      });
    }
    return this.client;
  }

  /** 两点球面直线距离(km),委托给 optimizer 模块(保留方法以便复用与测试) */
  private haversineKm(
    a: { lng: number; lat: number },
    b: { lng: number; lat: number },
  ): number {
    return haversineKm(a, b);
  }

  /**
   * 对每个 poiName 反查高德 POI 补经纬度。
   * 三层防错位(实测漠河等偏远目的地:高德城市限定搜不到会返回 2000km+ 外省重名):
   * 1. 目的地半径:候选距目的地中心超 200km 一律视为外省重名,剔除;
   * 2. 天锚点就近:每项从剩余候选中选离当天锚点最近的;
   * 3. 类型化放弃:FOOD/HOTEL 最近候选仍超 60km 才放弃坐标(泛名餐饮宁缺勿错);
   *    SPOT 不受 60km 限制——北极村距漠河市区 75km 是真实远景点,交给优化器排。
   * 城市限定无结果时用「目的地+名称」重搜;并发 2 + 失败重试,规避 QPS 限制。
   */
  private async enrichCoordinates(plan: Plan, destination: string) {
    let destCenter: { lng: number; lat: number } | null = null;
    try {
      destCenter = await this.geo.getCityCenter(destination);
    } catch {
      this.logger.warn(`目的地中心查询失败,仅靠锚点规则防错位: ${destination}`);
    }

    for (const day of plan.days) {
      const targets = day.items.filter((it) => it.poiName);
      const candidates = new Map<
        PlanItem,
        { id: string; lng: number; lat: number; type: string }[]
      >();
      const put = (
        it: PlanItem,
        pois: { id: string; lng: number; lat: number; type: string }[],
      ) =>
        candidates.set(
          it,
          pois.map((p) => ({ id: p.id, lng: p.lng, lat: p.lat, type: p.type })),
        );
      await mapLimit(targets, 2, async (it) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            // QPS 限流是主要失败原因,退避 500ms/1000ms 再试
            if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
            const pois = await this.geo.searchPoi(it.poiName!, destination);
            if (pois.length) {
              put(it, pois);
              return;
            }
            // 城市限定无结果:城市名并进关键词重搜(半径过滤兜底外省重名)
            put(it, await this.geo.searchPoi(`${destination}${it.poiName!}`));
            return;
          } catch {
            if (attempt === 2) {
              // 三次都异常:最后用合并关键词试一次
              try {
                put(it, await this.geo.searchPoi(`${destination}${it.poiName!}`));
              } catch {
                this.logger.warn(`POI 查询失败: ${it.poiName}`);
              }
            }
          }
        }
      });

      // 目的地半径过滤:剔除距中心 200km 外的外省重名候选
      if (destCenter) {
        const center = destCenter;
        for (const [it, list] of candidates) {
          const filtered = list.filter(
            (c) => this.haversineKm(center, c) <= 200,
          );
          if (!filtered.length && list.length) {
            this.logger.warn(
              `POI 候选均不在目的地范围内(>200km),全部剔除: ${it.poiName}`,
            );
          }
          candidates.set(it, filtered);
        }
      }

      // 天锚点:第一个有候选的 SPOT 的首选坐标
      const anchorItem = day.items.find(
        (it) => it.type === 'SPOT' && (candidates.get(it)?.length ?? 0) > 0,
      );
      const anchor = anchorItem ? candidates.get(anchorItem)![0] : null;

      for (const it of targets) {
        const list = candidates.get(it);
        if (!list?.length) continue;
        let best = list[0]!;
        if (anchor) {
          let bestDist = Infinity;
          for (const c of list) {
            const d = this.haversineKm(anchor, c);
            if (d < bestDist) {
              bestDist = d;
              best = c;
            }
          }
          // 泛名餐饮/住宿离当天区域 60km 必然是错配;SPOT 允许真实远距离
          if (bestDist > 60 && it.type !== 'SPOT') {
            this.logger.warn(
              `POI 偏离当天区域(${Math.round(bestDist)}km),放弃坐标: ${it.poiName}`,
            );
            continue;
          }
        }
        it.poiId = best.id;
        it.lng = best.lng;
        it.lat = best.lat;
        it.poiType = best.type;
      }

      // 评分/细分类目:按 poiId 查 POI 详情(失败或缺数据不阻塞,评分可缺)
      const withPoi = targets.filter((it) => it.poiId);
      await mapLimit(withPoi, 2, async (it) => {
        try {
          const d = await this.geo.getPoiDetail(it.poiId!);
          if (d) {
            it.rating = d.rating;
            if (d.type) it.poiType = d.type; // 详情类目更细,覆盖搜索类目
          }
        } catch {
          this.logger.warn(`POI 详情查询失败: ${it.poiName}`);
        }
      });
    }
  }

  /**
   * 行程地理优化(TTDP 三段式,见 optimizer.ts):
   * 1. Cluster-first:跨天离群景点重分配,避免跨城折返;
   * 2. 天气硬联动:雨天的户外景点与无雨天的室内景点双赢交换;
   * 3. Route-second:每天内部穷举精确排序(餐饮/住宿钉位),
   *    代价 = 道路里程 + U 型折返转向惩罚;
   * 4. Schedule-third:按点间距离估算交通耗时,重排时间轴。
   */
  private optimizePlan(plan: Plan, weatherByDay?: Map<number, WeatherCast>) {
    rebalanceDays(plan.days, (msg) => this.logger.warn(msg));
    if (weatherByDay?.size) {
      weatherAwareSwap(plan.days, weatherByDay, (msg) => this.logger.warn(msg));
    }
    for (const day of plan.days) {
      optimizeDayOrder(day.items);
      reflowDayTimes(day.items);
    }
  }

  /** 事务内重建该 trip 全部 items,并写入一条 AI 对话记录 */
  private async applyPlan(tripId: string, plan: Plan, userText: string) {
    const days = await this.prisma.tripDay.findMany({ where: { tripId } });
    const dayIdByIndex = new Map(days.map((d) => [d.dayIndex, d.id]));
    return this.prisma.$transaction(async (tx) => {
      if (days.length) {
        await tx.itineraryItem.deleteMany({
          where: { dayId: { in: days.map((d) => d.id) } },
        });
      }
      let dayCount = 0;
      let itemCount = 0;
      for (const day of plan.days) {
        const dayId = dayIdByIndex.get(day.dayIndex);
        if (!dayId) continue; // dayIndex 对不上的丢弃
        dayCount++;
        for (let i = 0; i < day.items.length; i++) {
          const it = day.items[i];
          await tx.itineraryItem.create({
            data: {
              dayId,
              orderIndex: i + 1,
              type: it.type,
              title: it.title,
              poiId: it.poiId ?? null,
              poiType: it.poiType ?? null,
              rating: it.rating ?? null,
              lng: it.lng ?? null,
              lat: it.lat ?? null,
              startTime: it.startTime,
              endTime: it.endTime,
              cost: it.cost,
              note: it.note,
              rawAi: it as unknown as Prisma.InputJsonValue,
            },
          });
          itemCount++;
        }
      }
      await tx.trip.update({
        where: { id: tripId },
        data: { updatedAt: new Date() },
      });
      await tx.aiConversation.createMany({
        data: [
          { tripId, role: 'user', content: userText },
          {
            tripId,
            role: 'assistant',
            content: `已生成 ${dayCount} 天行程,共 ${itemCount} 个条目`,
          },
        ],
      });
      return { dayCount, itemCount };
    });
  }

  /** 生成确定性的模拟行程(Mock 模式用) */
  private buildMockPlan(destination: string, dayCount: number): Plan {
    const spots: [string, string, number, string][] = [
      [`${destination}古城`, `${destination}古城漫步`, 60, '早上人不多,适合慢慢逛。'],
      [`${destination}博物馆`, `${destination}博物馆参观`, 0, '周一可能闭馆,去之前看一眼开放时间。'],
      [`${destination}地标`, `${destination}地标打卡`, 80, '下午光线好,拍照出片。'],
      [`${destination}公园`, `${destination}公园散步`, 20, '树荫多,走累了可以坐一会儿。'],
      [`${destination}老街`, `${destination}老街寻宝`, 0, '小店很多,砍价别心软。'],
      [`${destination}观景台`, `${destination}观景台看日落`, 50, '日落前半小时到,占个好位置。'],
    ];
    const lunches = ['当地特色午餐', '巷子里的老字号', '商场里的连锁餐厅'];
    const dinners = ['特色晚餐', '江边大排档', '本地人常去的馆子'];
    const days: Plan['days'] = [];
    for (let d = 0; d < dayCount; d++) {
      const morning = spots[(d * 2) % spots.length];
      const afternoon = spots[(d * 2 + 1) % spots.length];
      days.push({
        dayIndex: d,
        items: [
          {
            type: 'SPOT',
            title: morning[1],
            poiName: morning[0],
            startTime: '09:00',
            endTime: '11:30',
            cost: morning[2],
            note: morning[3],
          },
          {
            type: 'FOOD',
            title: lunches[d % lunches.length],
            poiName: null,
            startTime: '12:00',
            endTime: '13:00',
            cost: 50,
            note: '找本地人多的馆子,基本不踩雷。',
          },
          {
            type: 'SPOT',
            title: afternoon[1],
            poiName: afternoon[0],
            startTime: '14:00',
            endTime: '16:30',
            cost: afternoon[2],
            note: afternoon[3],
          },
          {
            type: 'FOOD',
            title: dinners[d % dinners.length],
            poiName: null,
            startTime: '18:30',
            endTime: '20:00',
            cost: 90,
            note: '招牌菜先点上,不够再加。',
          },
        ],
      });
    }
    return { days };
  }

  private get deepseekKey(): string {
    return this.cfg.get<string>('DEEPSEEK_API_KEY') ?? '';
  }

  private get amapKey(): string {
    return this.cfg.get<string>('AMAP_KEY') ?? '';
  }
}
