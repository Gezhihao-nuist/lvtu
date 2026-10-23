# 旅图 Lvtu

> 一句话说出目的地和偏好,AI 一分钟左右生成一份带地图、天气和真实路况的完整旅行行程。

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-12-e0234e?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169e1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/测试-后端135+前端31-6ee7b7)
![License](https://img.shields.io/badge/License-MIT-green)

![行程编辑器:左侧时间轴(含高德评分与花费),右侧地图标注当日点位、真实道路虚线连线,右上角天气/路况开关,顶栏分享/预算/体检/清单/导出](screenshots/editor-map.png)

## 简介

旅图是一个 AI 驱动的旅行规划全栈应用。输入目的地、天数和偏好(比如"第一次去北京,想看历史古迹,吃地道小吃"),DeepSeek 大模型生成逐日行程;后端把地名逐个反查成高德真实坐标,再经**运筹学 TTDP 优化器**排出不折返的游览顺序,地图自动标注、按真实道路连线;生成的行程可以继续对话式调整("第二天加一个颐和园")、粘贴小红书/马蜂窝攻略直接导入、临时加一天让 AI 单独规划,也可以手动拖拽精修。

设计上对标 Linear / Airbnb 的高级简洁:分屏品牌登录页、单主色 + 中性灰阶、毛玻璃顶栏、Spring 动效、完整的键盘可达性与焦点态。

## 功能特性

**核心规划**

- 🤖 **AI 行程生成** — DeepSeek 结构化输出(JSON Schema + Zod 校验 + 自动修复容错链),SSE 流式进度;未配置 Key 时自动降级为 Mock 演示模式
- 💬 **对话式调整** — "第二天加个颐和园"这类自然语言指令,AI 整体重排行程并保留上下文
- 📎 **攻略导入** — 粘贴小红书/马蜂窝攻略文字(或链接抓取),AI 提炼地点走完整坐标补全 + TTDP 管线落库
- 🧭 **TTDP 地理优化器** — 按运筹学旅游行程规划问题(Tourist Trip Design Problem)文献实现三段式:跨天离群点重分配(Cluster-first)→ 日内穷举精确排序 + U 型折返转向惩罚(Route-second)→ 按交通耗时重排时间轴(封顶不溢出午夜);实测把"1→2 跑 100km、3 又回到 1 附近"的 zigzag 行程总里程砍到六成以下
- 📍 **坐标补全防错位** — 目的地 200km 半径过滤外省重名 + 天锚点就近选候选 + 泛名餐饮 60km 放弃;偏远目的地(如漠河)POI 覆盖率实测 7/20 → 15/20;点击无坐标卡片还可**实时定位**并回写
- 🗓 **自定义天数** — DayTabs 末尾一键加/删天,顶栏日期弹窗改起止(缩短区间实时警示将被删的安排);空天提供「AI 规划这一天 / 手动添加」双入口,单天生成不碰其他天

**出行实用**

- 🗺 **地图联动** — 真实道路路径(步行/驾车自动选择)虚线连线;悬停卡片 marker 高亮弹跳;点击卡片地图平滑聚焦;marker 带类型图标与序号
- 🌦 **天气因子** — 高德逐日天气预报(当天+未来 3 天):AI 排程时雨雪天优先室内;优化器再做**确定性双赢交换**(雨天的户外景点 ↔ 晴天的室内场馆);Day 标签与地图浮层显示天气
- 🚗 **实时路况** — 地图开关一键叠加:只沿行程路线渲染路况(绿/黄/红实色衬底),与规划虚线视觉区分
- ⭐ **POI 评分** — 高德 POI 详情自动补全评分与细分类目,时间轴卡片直接显示
- 🩺 **行程体检** — 不调 AI 的确定性检查:折返/长单程/节奏松紧/雨天户外匹配,打分 A/B/C/D 并给可执行建议
- 💰 **预算记账** — 条目花费按分类/每日/人均聚合,总预算行内编辑,超支进度条变红
- 🎒 **行前清单** — 按目的地天气自动生成(雨雪带伞/高温防晒/低温厚外套),勾选进度本地保存
- 🗾 **足迹地图** — 行程列表顶部中国全图点亮去过的城市,点击城市筛选行程
- 🔗 **只读分享** — 一键生成免登录分享链接,关闭即 404;匿名访问自动降级为直线兜底
- 🖨 **PDF 行程单** — 打印优化视图(时间轴 + 评分 + 花费 + 预算),浏览器一键另存 PDF

**工程与安全**

- 🔐 **账号体系** — 注册/登录;JWT 双令牌 + refresh token 服务端会话化(sha256 落库、原子消费轮换、30s 宽限窗、超窗重放全端吊销);登录/注册限流;helmet 安全头;CORS 与环境变量启动校验
- 🛡 **优雅降级** — 三个外部 Key 任一缺失,对应能力降级而非报错(Mock 行程 / 手动输入 / 地图占位);SSE 断连全链路取消(不烧 token 不落库);封面图加载失败自动回退
- ✅ **全量测试** — 后端 135 例(AI/地理/行程/权限/优化器/认证会话/异常过滤)+ 前端 31 例,全部 vitest 全绿

**Roadmap**

- [ ] Phase 2 — 多人实时协作(Yjs CRDT)+ 在线光标 + 实付记账与 AA 分摊
- [ ] Phase 3 — 行程模板社区:发布、搜索、一键复用、点赞

## 更多截图

| 登录 | 行程列表 |
|---|---|
| ![登录页:teal 渐变品牌分屏](screenshots/login.png) | ![行程列表:足迹地图点亮去过的城市,每个目的地自动配城市实景封面](screenshots/trips.jpg) |

| AI 规划面板 | 悬停联动 |
|---|---|
| ![AI 规划面板:AI 生成 / 导入攻略双模式](screenshots/ai-panel.png) | ![悬停卡片地图 marker 高亮](screenshots/timeline-hover.png) |

| 行程体检 | PDF 行程单 |
|---|---|
| ![行程体检:评分等级 + 逐日指标 + 可执行建议](screenshots/health.png) | ![PDF 行程单:打印优化视图,一键另存 PDF](screenshots/print.png) |

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 · TypeScript · Vite · Tailwind CSS v4 · shadcn 风格组件(Radix)· Framer Motion · dnd-kit · TanStack Query · Zustand · Vitest |
| 后端 | NestJS 12(ESM)· Prisma 6 · PostgreSQL 15 · Passport JWT · Zod · Vitest |
| AI | DeepSeek(OpenAI 兼容协议,`json_object` 模式 + 结构化校验)|
| 地图 | 高德 JS API 2.0(前端,含 Driving 路况插件)+ 高德 Web 服务 API(后端代理:POI/路径/天气/行政区,防 Key 泄露)|
| 协作(Phase 2)| Yjs CRDT |

## 架构

```mermaid
graph LR
    A[React SPA<br/>Vite + Tailwind] -- REST / SSE --> B[NestJS API<br/>/api/v1]
    A -. WSS · Phase 2 .-> B
    B -- Prisma --> C[(PostgreSQL)]
    B -- OpenAI SDK --> D[DeepSeek 大模型]
    B -- REST 代理 + 缓存 --> E[高德 Web 服务<br/>POI / 路径 / 天气 / 行政区]
    A -- JS API 2.0 --> F[高德地图<br/>+ 路况插件]
```

设计要点:

- **AI 不编造坐标** — 大模型只输出地名,后端用高德 POI 逐个反查经纬度(并发限制 + 退避重试,规避个人 Key QPS 上限),三层防错位保证标不错
- **几何排序交给优化器,不交给 LLM** — 参照 ItiNera(EMNLP 2024)等研究:LLM 选点,TTDP 优化器排序,穷举精确解仅需毫秒
- **天气双保险** — 提示词软引导(雨雪室内)+ 算法硬兜底(错配双赢交换,几何增量超阈值不换)
- **单一写路径** — 行程编辑 REST 落库与(Phase 2 的)Yjs 协作文档不混写,避免冲突
- **降级优先** — 所有外部依赖缺失时应用仍可完整演示

## 项目结构

```
lvtu/
├── web/                        # 前端
│   └── src/
│       ├── components/ui/      # 设计系统组件(Button/Dialog/Toast…)
│       ├── features/
│       │   ├── auth/           # 登录 / 注册(分屏品牌布局)
│       │   ├── trips/          # 行程列表 + 城市封面 + 足迹地图
│       │   ├── trip/           # 编辑器:时间轴 / 地图(天气·路况) / AI 面板(生成·导入)
│       │   │                   #   预算 / 体检 / 清单 / 分享 / 日期弹窗 / 打印视图
│       │   └── share/          # 免登录只读分享页
│       ├── lib/                # api 封装 / SSE 解析 / 高德加载
│       └── stores/             # Zustand(auth,刷新去重)
└── server/                     # 后端
    ├── prisma/schema.prisma    # 数据模型单一事实源(含 RefreshToken 会话表)
    └── src/
        ├── auth/               # 注册登录 + 双令牌会话化轮换 + 限流
        ├── trip/               # 行程 CRUD + 权限守卫 + 预算聚合 + 体检 + 分享
        ├── ai/                 # DeepSeek 生成/对话/攻略导入/单天生成 + 坐标补全 + TTDP 优化器
        ├── geo/                # 高德代理(POI/详情/联想/路径/天气/行政区)+ 缓存上限
        └── common/             # 全局异常过滤(Prisma 映射)+ JWT 守卫
```

## 快速开始

**前置要求**:Node.js ≥ 20,PostgreSQL ≥ 15(本地安装或 Docker 均可)

```bash
git clone https://github.com/Gezhihao-nuist/lvtu.git
cd lvtu

# 1. 后端
cd server
npm install
cp .env.example .env        # 按需填写 Key(见下表)
npx prisma migrate dev      # 建表(DATABASE_URL 指向你的 Postgres)
npm run start:dev           # http://localhost:3000

# 2. 前端(新开终端)
cd web
npm install
cp .env.example .env        # 按需填写 Key
npm run dev                 # http://localhost:5173
```

打开 http://localhost:5173,注册账号即可使用。

### 环境变量

| Key | 位置 | 获取 | 缺失时行为 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | `server/.env` | [platform.deepseek.com](https://platform.deepseek.com) → API keys | AI 走内置 Mock 演示行程 |
| `AMAP_KEY` | `server/.env` | [lbs.amap.com](https://lbs.amap.com) 控制台,平台选「**Web服务**」(POI/路径/天气/行政区共用) | POI 搜索 503,可手动输入 |
| `VITE_AMAP_JS_KEY` + `VITE_AMAP_SECURITY_CODE` | `web/.env` | 同上,平台选「**Web端(JS API)**」,安全密钥同应用查看 | 地图区显示占位 |

> 修改 `.env` 后需重启对应服务;真实密钥请勿提交,`.gitignore` 已拦截。

### 测试

```bash
cd server && npx vitest run   # 后端 135 例
cd web && npm test            # 前端 31 例
```

## API 概览

前缀 `/api/v1`,除分享页外均需 `Authorization: Bearer <token>`。

- **Auth** — `POST /auth/register` `POST /auth/login` `POST /auth/refresh` `POST /auth/logout` `GET /auth/me`(登录/注册限流 5 次/分钟)
- **行程** — `GET/POST /trips` · `GET/PATCH/DELETE /trips/:id` · `POST /trips/:id/copy` · `GET /trips/:id/budget` · `GET /trips/:id/health`
- **日程项** — `POST /days/:dayId/items` · `PATCH/DELETE /items/:id` · `POST /items/:id/locate`(无坐标实时定位)· `POST /items/reorder`
- **AI(SSE)** — `POST /ai/trips/:id/generate` · `POST /ai/trips/:id/chat` · `POST /ai/trips/:id/import`(攻略导入)· `POST /ai/days/:dayId/generate`(单天生成)
- **地理** — `GET /geo/poi?keyword=&city=` · `GET /geo/tips?keyword=&city=` · `GET /geo/route?from=&to=&mode=` · `POST /geo/routes` · `GET /geo/weather?city=` · `GET /geo/district?city=`
- **分享(免登录)** — `GET /share/:id`(仅 visibility=LINK 时返回,白名单字段)
- **其他** — `POST /ai/fetch-url`(攻略链接抓取,SSRF 防护)· `GET /health`(DB 就绪探针)

## License

[MIT](LICENSE) © 2026 Gezhihao-nuist
