import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-20 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-card transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-accent-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50',
          className,
        )}
        {...props}
      />
    )
  },
)
