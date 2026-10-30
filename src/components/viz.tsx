'use client'

/**
 * Helm's charts: thin client wrappers over the overtrue/ui components, so server pages can pass plain data
 * (formatters and colours live here, not in props that cross the server boundary).
 */
import { useRouter } from 'next/navigation'
import { HeatmapChart } from '@/components/dashboardcn/ui/heatmap-chart'
import { MetricList } from '@/components/dashboardcn/ui/metric-list'
import { TickBar } from '@/components/dashboardcn/ui/tick-bar'
import { TrendChart } from '@/components/dashboardcn/ui/trend-chart'
import { ActivityHeatmap } from '@/components/overtrue/activity-heatmap'
import { BarList } from '@/components/overtrue/bar-list'
import { DonutChart } from '@/components/overtrue/donut-chart'
import { EventCalendar } from '@/components/overtrue/event-calendar'
import { DistributionBar } from '@/components/overtrue/distribution-bar'
import { GanttChart, type GanttTask } from '@/components/overtrue/gantt-chart'
import { RadialGauge } from '@/components/overtrue/radial-gauge'
import { Sparkline } from '@/components/overtrue/sparkline'
import { TeamWorkload, type WorkloadMember } from '@/components/overtrue/team-workload'
import { Empty } from '@/components/ui'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Projects by assessed health: on track, needs attention, at risk. */
export function HealthDonut({ onTrack, attention, atRisk }: { onTrack: number; attention: number; atRisk: number }) {
  const total = onTrack + attention + atRisk
  return (
    <DonutChart
      data={[
        { name: 'On track', value: onTrack, color: 'var(--color-good)' },
        { name: 'Needs attention', value: attention, color: 'var(--color-warn)' },
        { name: 'At risk', value: atRisk, color: 'var(--color-crit)' },
      ]}
      centerValue={total}
      centerLabel={total === 1 ? 'project' : 'projects'}
      valueFormatter={(v) => plural(v, 'project')}
      showLegend
      legendPosition="bottom"
      className="mx-auto max-w-[210px]"
    />
  )
}

/** One cell per day: how much happened on Helm (updates, comments, status changes), last six months. */
export function ActivityCalendar({ data, unit = 'events' }: { data: { date: string; value: number }[]; unit?: string }) {
  return (
    <ActivityHeatmap data={data} weeks={26} unit={unit} cellSize={11} gap={2} weekdayLabels="mwf" showLegend showSummary scrollToEnd
      valueFormatter={(v) => v.toLocaleString('en-IN')} />
  )
}

export function Trend({ data, label, className }: { data: number[]; label: string; className?: string }) {
  return <Sparkline data={data} label={label} className={className} />
}

export function Workload({ members, period, title }: { members: WorkloadMember[]; period: string; title?: string }) {
  return <TeamWorkload title={title} members={members} period={period} unit="d" className="shadow-card" />
}

/** A single stacked bar with a legend, e.g. tasks by status. */
export function Distribution({ segments }: { segments: { name: string; value: number; color: string }[] }) {
  return <DistributionBar segments={segments} showLegend valueFormatter={(v) => v.toLocaleString('en-IN')} />
}

type PlanBar = GanttTask & { href: string }

/**
 * The plan on a timeline: one bar per dated task from its start (or due date) to its due date, grouped by phase.
 * Picking a bar opens the task in the side panel. Read-only: dates change in the task, where the rules apply.
 */
export function PlanTimeline({ tasks, selectedId, undated }: { tasks: PlanBar[]; selectedId: string | null; undated: number }) {
  const router = useRouter()
  const href = new Map(tasks.map((t) => [t.id, t.href]))
  if (!tasks.length) return <div className="card"><Empty title="Nothing dated yet">Give tasks a due date to see them on the timeline.</Empty></div>
  return (
    <div className="flex flex-col gap-2">
      <GanttChart tasks={tasks} defaultZoom="week" selectedId={selectedId} className="shadow-card"
        title="Timeline" description="From each task's start (or due date) to its due date"
        onSelectedChange={(id) => { const h = id ? href.get(id) : undefined; if (h) router.push(h, { scroll: false }) }}
        dateFormatter={(d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} />
      {undated ? <p className="m-0 px-1 text-xs text-muted-foreground">{plural(undated, 'task')} without a due date {undated === 1 ? 'is' : 'are'} not shown. Switch to List to plan them.</p> : null}
    </div>
  )
}

/** Share of the plan done, as a small ring with the figure in the middle. */
export function ProgressRing({ value, size = 52 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <RadialGauge value={pct} size={size} thickness={size < 44 ? 3.5 : 5} sweep={360} startAngle={0} aria-label={`${pct}% of tasks done`}
      color={pct >= 100 ? 'var(--color-good)' : 'var(--color-primary)'}>
      <span className={size < 44 ? "tabular text-[10px] font-semibold" : "tabular text-[13px] font-semibold tracking-[-0.02em]"}>{pct}%</span>
    </RadialGauge>
  )
}

/** One thing on the calendar: a task on its due date, a finished task on the day it was completed, or a meeting. */
export type CalendarItem = {
  id: string; title: string; date: string; href: string
  kind: 'due' | 'done' | 'meeting'; overdue?: boolean; waiting?: boolean; context?: string
}

const dayOf = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y!, m! - 1, d!) }

/**
 * Month, week or agenda calendar of tasks and meetings. Open tasks sit on their due date (red when overdue, amber
 * when waiting on the customer), finished tasks on the day they were completed (green, ✓), meetings in purple.
 * Clicking an item opens it.
 */
export function TaskCalendar({ items, height = 640 }: { items: CalendarItem[]; height?: number }) {
  const router = useRouter()
  const href = new Map(items.map((i) => [i.id, i.href]))
  const events = items.map((i) => {
    const start = dayOf(i.date)
    return {
      id: i.id, allDay: true, start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1),
      title: `${i.kind === 'done' ? '✓ ' : ''}${i.title}`, location: i.context,
      color: i.kind === 'done' ? 'chart-2' : i.kind === 'meeting' ? 'chart-4' : i.overdue ? 'var(--color-crit)' : i.waiting ? 'chart-3' : 'chart-1',
    }
  })
  return (
    <EventCalendar events={events} defaultView="month" views={['month', 'week', 'agenda']} weekStartsOn={1} locale="en-GB"
      maxEventsPerDay={4} agendaDays={30} height={height} className="shadow-card"
      onEventClick={(e) => { const h = href.get(e.id); if (h) router.push(h) }} />
  )
}

export function CalendarLegend() {
  const items: [string, string][] = [['var(--color-chart-1)', 'Due'], ['var(--color-crit)', 'Overdue'], ['var(--color-chart-3)', 'With customer'], ['var(--color-chart-2)', 'Completed'], ['var(--color-chart-4)', 'Meeting']]
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-sm" style={{ background: c }} />{l}</span>)}
    </span>
  )
}

// ---- dashboardcn charts -----------------------------------------------------------------------------------------

/** Weekly series over time, e.g. tasks created against tasks completed. */
export function WeeklyTrend({ data, series, type = 'bar', height = 200 }: {
  data: Record<string, string | number>[]; series: { key: string; label: string; color?: string }[]; type?: 'bar' | 'area' | 'line'; height?: number
}) {
  return (
    <TrendChart data={data} xKey="week" series={series} type={type} showLegend legendPosition="top" legendAlign="right" barRadius={3}
      className="w-full" style={{ height }} yFormatter={(v) => v.toLocaleString('en-IN')} />
  )
}

/** Requests at each stage right now: one compact bar per stage, in workflow order. */
export function StageFunnel({ steps }: { steps: { name: string; value: number }[] }) {
  return <BarList data={steps} sortOrder="none" showPercentage valueFormatter={(v) => v.toLocaleString('en-IN')} className="text-xs" />
}

/** People × weeks: planned days, darker when fuller. */
export function LoadMatrix({ rows, columns, capacity }: { rows: { label: string; values: number[] }[]; columns: string[]; capacity: number }) {
  return (
    <HeatmapChart rows={rows} columns={columns} max={capacity} gap={2} unit="days" showLegend
      valueFormatter={(v) => `${+v.toFixed(1)}`}
      renderTooltip={(d) => <span><b>{d.rowLabel}</b>, week of {d.columnLabel}: {+d.value.toFixed(1)} of {capacity} days{d.value > capacity ? ' (over)' : ''}</span>} />
  )
}

/** Compact rows: label, 8-week sparkline, this week's figure and the change on last week. */
export function WeeklyMetrics({ items }: { items: { label: string; values: number[]; invert?: boolean }[] }) {
  return (
    <MetricList variant="area" showDivider items={items.map((i) => {
      const now = i.values.at(-1) ?? 0, prev = i.values.at(-2) ?? 0
      return { key: i.label, label: i.label, value: now, trend: i.values, invertDelta: i.invert, delta: prev ? (now - prev) / prev : undefined }
    })} />
  )
}

export function Ticks({ value, color }: { value: number; color?: string }) {
  return <TickBar value={Math.max(0, Math.min(100, value))} max={100} segments={20} color={color} className="h-3.5 w-20" aria-label={`${Math.round(value)}% done`} />
}
