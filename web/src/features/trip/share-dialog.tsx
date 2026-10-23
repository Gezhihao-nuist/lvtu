import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { TripDetail } from '../../types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { toast } from '../../components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  trip: TripDetail
}

export function ShareDialog({ open, onClose, trip }: ShareDialogProps) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const shared = trip.visibility === 'LINK'
  const shareUrl = `${window.location.origin}/share/${trip.id}`

  const toggle = useMutation({
    mutationFn: (visibility: 'PRIVATE' | 'LINK') =>
      api(`/trips/${trip.id}`, { method: 'PATCH', body: JSON.stringify({ visibility }) }),
    onSuccess: (_data, visibility) => {
      toast.success(visibility === 'LINK' ? '分享已开启' : '分享已关闭')
      void queryClient.invalidateQueries({ queryKey: ['trip', trip.id] })
    },
    onError: () => toast.error('操作失败,请稍后再试'),
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('复制失败,请手动选择链接复制')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>分享行程</DialogTitle>
          <DialogDescription>
            开启后,知道链接的人都能免登录查看这份行程(只读,不可编辑);关闭后链接立即失效
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <Link2 className="size-4 text-zinc-400" />
            <div>
              <p className="text-sm font-medium text-zinc-900">链接分享</p>
              <p className="text-xs text-zinc-500">{shared ? '已开启,任何人可查看' : '未开启,仅自己可见'}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant={shared ? 'outline' : 'primary'}
            loading={toggle.isPending}
            onClick={() => toggle.mutate(shared ? 'PRIVATE' : 'LINK')}
          >
            {shared ? '关闭分享' : '开启分享'}
          </Button>
        </div>

        {shared && (
          <div className="flex gap-2">
            <Input readOnly value={shareUrl} className="tnum text-xs" onFocus={(e) => e.target.select()} />
            <Button size="md" variant="secondary" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
