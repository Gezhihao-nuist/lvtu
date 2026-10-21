import type { ComponentType, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-6 py-16 text-center',
        className,
      )}
    >
      <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-zinc-100">
        <Icon className="size-6 text-zinc-400" />
      </div>
      <p className="text-base font-medium text-zinc-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
