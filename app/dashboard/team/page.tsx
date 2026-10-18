'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  BuildingsIcon,
  EnvelopeSimpleIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PhoneIcon,
  TreeStructureIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { ACCESS_ROLE_META } from '@/convex/permissions'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/segmented'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { ConfirmDialog } from '@/components/ui/modal'
import { PersonDialog, type PersonDraft } from '@/components/people/person-dialog'
import { InviteDialog, type InviteTarget } from '@/components/people/invite-dialog'
import { DepartmentsDialog } from '@/components/people/departments-dialog'
import { ProfileDialog, type ProfileTarget } from '@/components/people/profile-dialog'
import { Pager } from '@/components/ui/pagination'
import { usePagination } from '@/lib/use-pagination'
import { cn, errorMessage, formatCurrency } from '@/lib/utils'

type Directory = NonNullable<FunctionReturnType<typeof api.people.directory>>
type Person = Directory['people'][number]

const LOGIN_BADGE: Record<NonNullable<Person['loginStatus']>, { label: string; tone: BadgeTone }> = {
  active: { label: 'Signed up', tone: 'success' },
  invited: { label: 'Invited', tone: 'info' },
  expired: { label: 'Invite expired', tone: 'warning' },
  none: { label: 'Not invited', tone: 'neutral' },
}

const NO_DEPARTMENT = 'none'
const PEOPLE_PAGE_SIZE = 6

export default function PeoplePage() {
  const directory = useQuery(api.people.directory)
  const deactivate = useMutation(api.people.deactivate)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<PersonDraft | null>(null)
  const [personOpen, setPersonOpen] = useState(false)
  const [inviting, setInviting] = useState<InviteTarget | null>(null)
  const [removing, setRemoving] = useState<Person | null>(null)
  const [removeError, setRemoveError] = useState('')
  const [deptsOpen, setDeptsOpen] = useState(false)
  const [viewing, setViewing] = useState<ProfileTarget | null>(null)

  const people = useMemo(() => directory?.people ?? [], [directory])
  const departments = useMemo(() => directory?.departments ?? [], [directory])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = people.filter(
      (p) =>
        (filter === 'all' || (p.departmentId ?? NO_DEPARTMENT) === filter) &&
        (!q || [p.name, p.jobTitle, p.email, p.department ?? ''].some((v) => v.toLowerCase().includes(q))),
    )
    const sections = departments
      .map((d) => ({ id: d.id as string, name: d.name, people: matches.filter((p) => p.departmentId === d.id) }))
      .concat([{ id: NO_DEPARTMENT, name: 'No department', people: matches.filter((p) => !p.departmentId) }])
    return sections.filter((s) => s.people.length > 0)
  }, [people, departments, filter, query])

  if (directory === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Company" title="People" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-[22px]" />)}
        </div>
      </div>
    )
  }
  if (directory === null) return null

  const { canManage, canSetAccess } = directory
  const personOptions = people.map((p) => ({ id: p.id as string, name: p.name }))
  const departmentOptions = departments.map((d) => ({ id: d.id as string, name: d.name }))
  const filterOptions = [
    { value: 'all', label: 'Everyone', count: people.length },
    ...departments.filter((d) => d.headcount > 0).map((d) => ({ value: d.id as string, label: d.name, count: d.headcount })),
  ]

  function openEdit(p: Person) {
    setEditing({
      id: p.id,
      name: p.name,
      email: p.email,
      jobTitle: p.jobTitle,
      phone: p.phone ?? '',
      departmentId: p.departmentId ?? '',
      lineManagerId: p.lineManagerId ?? '',
      accessRole: p.accessRole,
    })
    setPersonOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="People"
        description={`${people.length} people across ${departments.length} departments`}
        actions={
          canManage && (
            <>
              <button onClick={() => setDeptsOpen(true)} className="btn btn-secondary">
                <BuildingsIcon size={17} />
                Departments
              </button>
              <button
                onClick={() => {
                  setEditing(null)
                  setPersonOpen(true)
                }}
                className="btn btn-primary"
              >
                <UserPlusIcon size={17} weight="bold" />
                Add person
              </button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Filter by department" options={filterOptions} value={filter} onChange={setFilter} />
        <div className="relative w-full sm:w-72">
          <MagnifyingGlassIcon size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, title, email…"
            className="input has-icon h-10 rounded-full"
            aria-label="Search people"
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState icon={UsersThreeIcon} title="Nobody matches" description="Try another name or department." />
        </div>
      ) : (
        groups.map((g) => (
          <DepartmentSection
            key={g.id}
            name={g.name}
            people={g.people}
            resetKey={`${filter}|${query}`}
            renderCard={(p) => (
              <PersonCard
                key={p.id}
                person={p}
                canManage={canManage}
                onOpen={p.workStats || p.isYou ? () => setViewing({ id: p.id, name: p.name, jobTitle: p.jobTitle }) : undefined}
                onEdit={() => openEdit(p)}
                onInvite={() => setInviting({ id: p.id, name: p.name, email: p.email, signedIn: p.loginStatus === 'active' })}
                onRemove={() => {
                  setRemoveError('')
                  setRemoving(p)
                }}
              />
            )}
          />
        ))
      )}

      <ProfileDialog target={viewing} onClose={() => setViewing(null)} />
      <PersonDialog
        open={personOpen}
        onClose={() => setPersonOpen(false)}
        initial={editing}
        people={personOptions}
        departments={departmentOptions}
        canSetAccess={canSetAccess}
      />
      <InviteDialog target={inviting} onClose={() => setInviting(null)} />
      <DepartmentsDialog
        open={deptsOpen}
        onClose={() => setDeptsOpen(false)}
        departments={departments.map((d) => ({ ...d, id: d.id as string }))}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.name}?`}
        message={
          removeError ||
          `${removing?.name} will be signed out and hidden from the directory. Their deals and history stay. Anyone reporting to them will need a new line manager.`
        }
        confirmLabel="Remove"
        icon={UserMinusIcon}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await deactivate({ id: removing.id as Id<'employees'> })
            setRemoving(null)
          } catch (err) {
            setRemoveError(errorMessage(err))
          }
        }}
      />
    </div>
  )
}

function DepartmentSection({
  name,
  people,
  resetKey,
  renderCard,
}: {
  name: string
  people: Person[]
  resetKey: string
  renderCard: (p: Person) => React.ReactNode
}) {
  const pagination = usePagination(people, PEOPLE_PAGE_SIZE, resetKey)
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-[17px] font-semibold text-fg">{name}</h2>
        <span className="text-[12px] text-fg-3">{people.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{pagination.pageItems.map(renderCard)}</div>
      <Pager pagination={pagination} />
    </section>
  )
}

function PersonCard({
  person: p,
  canManage,
  onOpen,
  onEdit,
  onInvite,
  onRemove,
}: {
  person: Person
  canManage: boolean
  onOpen?: () => void
  onEdit: () => void
  onInvite: () => void
  onRemove: () => void
}) {
  const login = p.loginStatus ? LOGIN_BADGE[p.loginStatus] : null
  return (
    <article
      onClick={onOpen}
      className={cn('card flex flex-col p-5 transition-shadow hover:shadow-pop', onOpen && 'cursor-pointer')}
    >
      <div className="flex items-start gap-3.5">
        <Avatar name={p.name} size={52} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate font-display text-[17px] font-semibold leading-tight text-fg">
            {onOpen ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen()
                }}
                className="hover:text-brand focus-visible:text-brand"
                aria-label={`View ${p.name}'s projects and tasks`}
              >
                {p.name}
              </button>
            ) : (
              p.name
            )}
            {p.isYou && <span className="ml-1.5 align-middle text-[11px] font-medium text-fg-3">(you)</span>}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-fg-2">{p.jobTitle}</p>
        </div>
        {p.accessRole !== 'staff' && <Badge tone="info">{ACCESS_ROLE_META[p.accessRole].label}</Badge>}
      </div>

      <dl className="mt-4 space-y-2 text-[12.5px]">
        <div className="flex items-center gap-2.5 text-fg-2">
          <TreeStructureIcon size={16} className="shrink-0 text-fg-3" />
          <span className="truncate">{p.lineManager ? `Reports to ${p.lineManager}` : 'Reports to no one'}</span>
        </div>
        <a href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 text-fg-2 hover:text-brand">
          <EnvelopeSimpleIcon size={16} className="shrink-0 text-fg-3" />
          <span className="truncate">{p.email}</span>
        </a>
        {p.phone && (
          <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 text-fg-2 hover:text-brand">
            <PhoneIcon size={16} className="shrink-0 text-fg-3" />
            <span className="truncate">{p.phone}</span>
          </a>
        )}
      </dl>

      {(p.workStats || p.dealStats) && (
        <dl className={cn('mt-4 grid gap-3 rounded-2xl bg-muted p-3.5 text-[12px]', p.workStats && p.dealStats ? 'grid-cols-3' : 'grid-cols-2')}>
          {p.workStats && (
            <>
              <div>
                <dt className="text-fg-3">Active projects</dt>
                <dd className="tabular mt-0.5 font-display text-[18px] font-semibold text-fg">{p.workStats.activeProjects}</dd>
              </div>
              <div>
                <dt className="text-fg-3">Open tasks</dt>
                <dd className="tabular mt-0.5 font-display text-[18px] font-semibold text-fg">{p.workStats.activeTasks}</dd>
              </div>
            </>
          )}
          {p.dealStats && (
            <div className="min-w-0">
              <dt className="text-fg-3">Collected</dt>
              <dd className="tabular mt-0.5 truncate font-display text-[18px] font-semibold text-fg">
                {formatCurrency(p.dealStats.collected, 'GHS').replace('.00', '')}
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="flex-1" />
      {canManage && (
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3" onClick={(e) => e.stopPropagation()}>
          {login ? (
            <Badge tone={login.tone} dot>
              {login.label}
            </Badge>
          ) : (
            <span />
          )}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onInvite}
              className="icon-btn icon-btn-sm"
              aria-label={`Invite ${p.name}`}
              title={p.loginStatus === 'active' ? 'Send a new sign-in link' : 'Invite'}
            >
              <PaperPlaneTiltIcon size={17} />
            </button>
            <button type="button" onClick={onEdit} className="icon-btn icon-btn-sm" aria-label={`Edit ${p.name}`} title="Edit">
              <PencilSimpleIcon size={17} />
            </button>
            {!p.isYou && (
              <button
                type="button"
                onClick={onRemove}
                className="icon-btn icon-btn-sm icon-btn-danger"
                aria-label={`Remove ${p.name}`}
                title="Remove"
              >
                <UserMinusIcon size={17} />
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
