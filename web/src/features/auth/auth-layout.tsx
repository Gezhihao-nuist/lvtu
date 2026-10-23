import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CloudSun, HeartPulse, MapPinned, Route, Sparkles } from 'lucide-react'

const FEATURES = [
  { icon: Sparkles, title: 'AI 一键规划', desc: '一分钟生成多日行程,景点美食住宿自动排好' },
  { icon: Route, title: '地图路线联动', desc: 'TTDP 地理优化排序,每天少走回头路' },
  { icon: CloudSun, title: '天气感知', desc: '雨雪天自动排室内,行前清单按天气生成' },
  { icon: HeartPulse, title: '行程体检', desc: '折返、长单程、节奏松紧,打分并给建议' },
]

/**
 * 登录/注册共用布局:左侧品牌面板(大屏)+ 右侧表单。
 * 装饰动画只动 transform,全局 reduced-motion 规则会自动降级。
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* 品牌面板:lg 及以上显示 */}
      <aside className="relative hidden overflow-hidden lg:flex lg:w-[47%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-600 via-accent-700 to-accent-900" />
        {/* 装饰光斑 */}
        <motion.div
          aria-hidden
          className="absolute -right-32 -top-32 size-112 rounded-full bg-accent-400/30 blur-3xl"
          animate={{ y: [0, 24, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-40 -left-24 size-104 rounded-full bg-teal-300/20 blur-3xl"
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* 网格点纹理 */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.5) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        <div className="relative flex items-center gap-2.5 text-white">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <MapPinned className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">旅图</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-[1.2] tracking-tight text-white xl:text-4xl 2xl:text-5xl">
            把每一次旅行,
            <br />
            都画成一张清晰的图。
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-accent-50/90">
            AI 生成行程、地图路线、天气、预算、体检,一个页面全部搞定。
          </p>
          <ul className="mt-9 space-y-5">
            {FEATURES.map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-start gap-3.5"
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
                  <f.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-accent-50/80">{f.desc}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-accent-100/70">
          高德地图数据 · DeepSeek 驱动 · TTDP 行程优化算法
        </p>
      </aside>

      {/* 表单区 */}
      <main className="bg-ambient flex flex-1 items-center justify-center px-4 py-10">
        {children}
      </main>
    </div>
  )
}
