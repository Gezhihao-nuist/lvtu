import { create } from 'zustand'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  title: string
}

interface ToastStore {
  toasts: ToastItem[]
  push: (kind: ToastKind, title: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  push(kind, title) {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, title }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

/** 任意处调用:toast.success('已保存') */
export const toast = {
  success: (title: string) => useToastStore.getState().push('success', title),
  error: (title: string) => useToastStore.getState().push('error', title),
  info: (title: string) => useToastStore.getState().push('info', title),
}

const icons: Record<ToastKind, typeof Info> = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
}

const iconColor: Record<ToastKind, string> = {
  success: 'text-accent-600',
  error: 'text-red-500',
  info: 'text-zinc-500',
}

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const Icon = icons[item.kind]
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-zinc-200/70 bg-white py-2.5 pl-3.5 pr-2.5 shadow-overlay"
      role="status"
    >
      <Icon className={cn('size-4 shrink-0', iconColor[item.kind])} />
      <p className="text-sm text-zinc-800">{item.title}</p>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={() => dismiss(item.id)}
        className="ml-1 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  )
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}

