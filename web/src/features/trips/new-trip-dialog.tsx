import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { addDays, diffDays, todayIso } from '../../lib/format'
import type { TripDetail } from '../../types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Sparkles } from 'lucide-react'

interface NewTripDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateTripBody {
  title: string
  destination: string
  startDate: string
  endDate: string
  budgetTotal?: number
}

export function NewTripDialog({ open, onOpenChange }: NewTripDialogProps) {
  const navigate = useNavigate()
  const [destination, setDestination] = useState('')
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [endDate, setEndDate] = useState(addDays(todayIso(), 2))
  const [budget, setBudget] = useState('')
  const [error, setError] = useState('')

  const createTrip = useMutation({
    mutationFn: (body: CreateTripBody) =>
      api<TripDetail>('/trips', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (trip) => {
      reset()
      onOpenChange(false)
      navigate(`/trips/${trip.id}`)
    },
    onError: (err) => {
      setError(err instanceof Error && err.message ? err.message : '创建失败,请稍后再试')
    },
  })

  const reset = () => {
    setDestination('')
    setTitle('')
    setBudget('')
    setError('')
  }

  const handleSubmit = async () => {
    setError('')
    const dest = destination.trim()
    if (!dest) return setError('目的地不能为空')
    if (!startDate || !endDate) return setError('请选择出行日期')
    if (diffDays(startDate, endDate) < 0) return setError('结束日期不能早于开始日期')
    if (diffDays(startDate, endDate) > 29) return setError('行程最长 30 天')
    const budgetNum = budget.trim() ? Number(budget) : undefined
    if (budgetNum !== undefined && (!Number.isFinite(budgetNum) || budgetNum < 0)) {
      return setError('预算需要是一个正数')
    }
    await createTrip.mutateAsync({
      title: title.trim() || `${dest}之旅`,
      destination: dest,
      startDate,
      endDate,
      ...(budgetNum !== undefined ? { budgetTotal: budgetNum } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建行程</DialogTitle>
          <DialogDescription>先定目的地和日期,细节可以慢慢填</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <label htmlFor="trip-destination" className="text-sm font-medium text-zinc-700">
              目的地
            </label>
            <Input
              id="trip-destination"
              placeholder="想去哪儿?如:京都"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="trip-start" className="text-sm font-medium text-zinc-700">
                开始日期
              </label>
              <Input
                id="trip-start"
                type="date"
                className="tnum"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="trip-end" className="text-sm font-medium text-zinc-700">
                结束日期
              </label>
              <Input
                id="trip-end"
                type="date"
                className="tnum"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="trip-title" className="text-sm font-medium text-zinc-700">
              行程标题 <span className="font-normal text-zinc-400">可选</span>
            </label>
            <Input
              id="trip-title"
              placeholder={destination.trim() ? `${destination.trim()}之旅` : '默认「目的地之旅」'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="trip-budget" className="text-sm font-medium text-zinc-700">
              预算(元) <span className="font-normal text-zinc-400">可选</span>
            </label>
            <Input
              id="trip-budget"
              type="number"
              min={0}
              inputMode="decimal"
              className="tnum"
              placeholder="如:5000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Sparkles className="size-3.5 text-accent-600" />
            创建后可用 AI 一键生成行程
          </p>

          <DialogFooter>
            <Button type="submit" loading={createTrip.isPending} className="w-full">
              {createTrip.isPending ? '创建中…' : '创建行程'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
