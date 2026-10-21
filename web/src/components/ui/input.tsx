import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-card transition-colors placeholder:text-zinc-400 hover:border-zinc-300 focus:border-accent-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50',
          className,
        )}
        {...props}
      />
    )
  },
)
