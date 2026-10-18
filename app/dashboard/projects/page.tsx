'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { CalendarBlankIcon, CheckCircleIcon, FolderPlusIcon, FolderSimpleIcon, ListChecksIcon, WarningIcon } from '@phosphor-icons/react'
import { api } from '@/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import { PageHeader } from '@/components/ui/page-header'
import { StatStrip } from '@/components/ui/stat-strip'
import { Segmented } from '@/components/ui/segmented'
import { AvatarStack, Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageSkeleton, Progress } from '@/components/ui/states'
import { ProjectDialog } from '@/components/projects/project-dialog'
import { PROJECT_STATUS, formatShortDate, type ProjectStatus } from '@/components/projects/meta'
import { cn } from '@/lib/utils'
import { Pager } from '@/components/ui/pagination'
import { CARD_PAGE_SIZE, usePagination } from '@/lib/use-pagination'

type Row = NonNullable<FunctionReturnType<typeof api.projects.list>>['projects'][number]

export default function ProjectsPage() {
  const data = useQuery(api.projects.list)
  const [status, setStatus] = useState<'all' | ProjectStatus>('all')
  const [scope, setScope] = useState<'mine' | 'all'>('all')
  const [newOpen, setNewOpen] = useState(false)

  const projects = useMemo(() => data?.projects ?? [], [data])
  const scoped = data?.canCreate && scope === 'mine' ? projects.filter((p) => p.isMine) : projects
  const shown = status === 'all' ? scoped : scoped.filter((p) => p.status === status)
  const pages = usePagination(shown, CARD_PAGE_SIZE, `${status}|${scope}`)

  const header = (
    <PageHeader
      eyebrow="Delivery"
      title="Projects"
      description={data?.canCreate ? 'Every delivery project, its team and progress.' : 'The projects you are working on.'}
      actions={
        data?.canCreate && (
          <button onClick={() => setNewOpen(true)} className="btn btn-primary">
            <FolderPlusIcon size={17} weight="bold" />
            New project
          </button>
        )
      }
    />
  )

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <PageSkeleton />
      </div>
    )
  }

  const active = projects.filter((p) => p.status === 'active').length
  const completed = projects.filter((p) => p.status === 'completed').length
  const openTasks = projects.reduce((s, p) => s + p.tasks.total - p.tasks.done, 0)
  const overdueTasks = projects.reduce((s, p) => s + p.tasks.overdue, 0) 

  return (
    <div className="space-y-6">
      {header}

      <StatStrip
        stats={[
          { label: 'Active projects', value: String(active), icon: FolderSimpleIcon, hint: `${projects.length} in total` },
          { label: 'Completed', value: String(completed), icon: CheckCircleIcon },
          { label: 'Open tasks', value: String(openTasks), icon: ListChecksIcon },
          { label: 'Overdue tasks', value: String(overdueTasks), icon: WarningIcon, trend: overdueTasks ? 'down' : undefined, hint: overdueTasks ? 'need attention' : 'all on track' },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all' as const, label: 'All', count: scoped.length },
            ...(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((s) => ({
              value: s,
              label: PROJECT_STATUS[s].label,
              count: scoped.filter((p) => p.status === s).length,
            })),
          ]}
        />
        {data.canCreate && (
          <Segmented
            label="Whose projects"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All projects' },
              { value: 'mine', label: 'My projects' },
            ]}
          />
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FolderSimpleIcon}
            title={projects.length === 0 ? 'No projects yet' : 'Nothing matches'}
            description={
              projects.length === 0
                ? data.canCreate
                  ? 'Create a project for each piece of client work, then add the team and tasks.'
                  : "When you're added to a project, it shows up here."
                : 'Try another filter.'
            }
            action={
              data.canCreate && projects.length === 0 ? (
                <button onClick={() => setNewOpen(true)} className="btn btn-primary">
                  <FolderPlusIcon size={16} weight="bold" />
                  New project
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {pages.pageItems.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
          <Pager pagination={pages} />
        </div>
      )}

      <ProjectDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function ProjectCard({ project: p }: { project: Row }) {
  const status = PROJECT_STATUS[p.status]
  return (
    <Link href={`/dashboard/projects/${p.id}`} className="card flex flex-col p-5 transition-shadow hover:shadow-pop">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[30%] bg-brand-soft font-display text-[12px] font-bold text-brand">
          {p.key}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-semibold leading-tight text-fg">{p.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-fg-2">{p.client || 'Internal'}</p>
        </div>
        <Badge tone={status.tone} dot>{status.label}</Badge>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
          <span className="text-fg-3">
            {p.tasks.done}/{p.tasks.total} tasks
            {p.tasks.overdue > 0 && <span className="ml-1.5 font-semibold text-danger">· {p.tasks.overdue} overdue</span>}
          </span>
          <span className="tabular font-semibold text-fg-2">{p.progress}%</span>
        </div>
        <Progress value={p.progress} tone={p.progress === 100 ? 'success' : 'brand'} />
      </div>

      <div className="flex-1" />
      <div className="mt-5 flex items-center gap-3 border-t border-line pt-3.5">
        {p.lead ? (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={p.lead.name} size={26} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[12px] font-semibold text-fg">{p.lead.name}</p>
              <p className="text-[10.5px] text-fg-3">Team lead</p>
            </div>
          </div>
        ) : (
          <span className="text-[12px] text-fg-3">No lead yet</span>
        )}
        <span className="flex-1" />
        {p.team.length > 0 && <AvatarStack names={p.team} size={24} max={3} />}
        {p.dueDate && (
          <span className={cn('flex items-center gap-1 text-[12px]', p.overdue ? 'font-semibold text-danger' : 'text-fg-3')}>
            <CalendarBlankIcon size={13} />
            {formatShortDate(p.dueDate)}
          </span>
        )}
      </div>
    </Link>
  )
}
