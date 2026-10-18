'use client'

import { Fragment, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import {
  AirplaneTiltIcon,
  CalendarCheckIcon,
  CalendarPlusIcon,
  CaretDownIcon,
  HourglassMediumIcon,
  ListChecksIcon,
  PlusIcon,
  UmbrellaIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { formatDateRange } from '@/convex/dates'
import { PageHeader } from '@/components/ui/page-header'
import { StatStrip } from '@/components/ui/stat-strip'
import { Segmented } from '@/components/ui/segmented'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Alert, Input } from '@/components/ui/field'
import { EmptyState, PageSkeleton } from '@/components/ui/states'
import { ConfirmDialog } from '@/components/ui/modal'
import { RequestStatusBadge, StepsTimeline } from '@/components/work/request-status'
import { LeaveRequestDialog } from '@/components/work/leave-request-dialog'
import { Pager } from '@/components/ui/pagination'
import { TABLE_PAGE_SIZE, usePagination } from '@/lib/use-pagination'
import { useRole } from '@/lib/role-context'
import { cn, errorMessage, formatRelativeDate } from '@/lib/utils'

type LeaveRequest = NonNullable<FunctionReturnType<typeof api.leave.mine>>['requests'][number]
type StatusFilter = 'all' | LeaveRequest['status']

export default function LeavePage() {
  return (
    <Suspense>
      <LeaveContent />
    </Suspense>
  )
}

function LeaveContent() {
  const { user, can } = useRole()
  const router = useRouter()
  const tab = useSearchParams().get('tab') ?? 'mine'
  const data = useQuery(api.leave.mine)
  const [requestOpen, setRequestOpen] = useState(false)
  const isHr = can('hr.manage')

  const tabs = [
    { value: 'mine', label: 'My requests' },
    { value: 'away', label: "Who's away" },
    ...(isHr ? [{ value: 'register', label: 'Register' }, { value: 'allowances', label: 'Allowances & types' }] : []),
  ]

  const header = (
    <PageHeader
      eyebrow="Time off"
      title="Leave"
      description={user ? `${user.name}${user.department ? ` · ${user.department}` : ''}` : undefined}
      actions={
        <button onClick={() => setRequestOpen(true)} className="btn btn-primary" disabled={!data}>
          <CalendarPlusIcon size={17} weight="bold" />
          Request leave
        </button>
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

  const { balance } = data
  return (
    <div className="space-y-6">
      {header}

      <StatStrip
        stats={[
          { label: 'Days remaining', value: String(balance.remaining), icon: UmbrellaIcon, hint: `of ${balance.entitlement} in ${data.year}` },
          { label: 'Awaiting approval', value: String(balance.pendingRequests), icon: HourglassMediumIcon, hint: `${balance.pending} annual day${balance.pending !== 1 ? 's' : ''} held` },
          { label: 'Days taken', value: String(balance.taken), icon: CalendarCheckIcon, hint: 'annual leave this year' },
          { label: 'Entitlement', value: String(balance.entitlement), icon: AirplaneTiltIcon, hint: "this year's allowance" },
        ]}
      />

      <Segmented label="Leave sections" options={tabs} value={tab} onChange={(v) => router.replace(`/dashboard/leave?tab=${v}`)} />

      {tab === 'away' ? (
        <WhosAway />
      ) : tab === 'register' && isHr ? (
        <Register />
      ) : tab === 'allowances' && isHr ? (
        <Allowances />
      ) : (
        <MyRequests requests={data.requests} onNew={() => setRequestOpen(true)} />
      )}

      <LeaveRequestDialog
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        types={data.types}
        remaining={balance.remaining}
        autoApproved={data.autoApproved}
        route={data.route}
      />
    </div>
  )
}

// ── My requests ────────────────────────────────────────────────────────

function MyRequests({ requests, onNew }: { requests: LeaveRequest[]; onNew: () => void }) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [withdrawing, setWithdrawing] = useState<LeaveRequest | null>(null)
  const withdraw = useMutation(api.leave.withdraw)

  if (requests.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={CalendarCheckIcon}
          title="No leave requests yet"
          description="When you request time off, it shows up here with where it is in approval."
          action={
            <button onClick={onNew} className="btn btn-primary">
              <PlusIcon size={16} weight="bold" />
              Request leave
            </button>
          }
        />
      </div>
    )
  }

  const count = (s: StatusFilter) => (s === 'all' ? requests.length : requests.filter((r) => r.status === s).length)
  const shown = filter === 'all' ? requests : requests.filter((r) => r.status === filter)

  return (
    <Card flush>
      <div className="p-5 pb-4 md:p-6 md:pb-4">
        <Segmented
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={(['all', 'pending', 'approved', 'declined', 'withdrawn'] as const).map((s) => ({
            value: s,
            label: s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1),
            count: count(s),
          }))}
        />
      </div>
      <RequestTable key={filter} requests={shown} showEmployee={false} onWithdraw={setWithdrawing} />
      <ConfirmDialog
        open={Boolean(withdrawing)}
        title="Withdraw this request?"
        message={withdrawing ? `${withdrawing.type}, ${formatDateRange(withdrawing.startDate, withdrawing.endDate)}. ${withdrawing.status === 'approved' ? 'Your line manager will be told it was cancelled.' : 'Approvers will no longer see it.'}` : ''}
        confirmLabel="Withdraw"
        onClose={() => setWithdrawing(null)}
        onConfirm={async () => {
          if (withdrawing) await withdraw({ id: withdrawing.id })
          setWithdrawing(null)
        }}
      />
    </Card>
  )
}

function RequestTable({
  requests,
  showEmployee,
  onWithdraw,
}: {
  requests: LeaveRequest[]
  showEmployee: boolean
  onWithdraw?: (r: LeaveRequest) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const pages = usePagination(requests, TABLE_PAGE_SIZE)
  if (requests.length === 0) return <p className="border-t border-line px-6 py-10 text-center text-[13px] text-fg-3">Nothing here.</p>

  const details = (r: LeaveRequest) => (
    <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
      <div>
        <p className="eyebrow mb-1.5">Reason</p>
        <p className="text-[13px] text-fg-2">{r.reason || '–'}</p>
        {onWithdraw && r.canWithdraw && (
          <button onClick={() => onWithdraw(r)} className="btn btn-secondary btn-sm mt-4">
            Withdraw request
          </button>
        )}
      </div>
      <div>
        <p className="eyebrow mb-2">Approval</p>
        <StepsTimeline steps={r.steps} autoApproved={r.status === 'approved'} requestStatus={r.status} />
      </div>
    </div>
  )

  return (
    <>
      {/* Phones: stacked cards */}
      <ul className="divide-y divide-line border-t border-line md:hidden">
        {pages.pageItems.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="trow flex w-full items-start gap-3 px-5 py-3.5 text-left" aria-expanded={open === r.id}>
              {showEmployee && <Avatar name={r.employee} size={34} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[13.5px] font-semibold text-fg">{showEmployee ? r.employee : r.type}</p>
                  <RequestStatusBadge status={r.status} />
                </div>
                <p className="mt-0.5 text-[12px] text-fg-2">
                  {showEmployee && `${r.type} · `}
                  {formatDateRange(r.startDate, r.endDate)} · {r.days} day{r.days !== 1 ? 's' : ''}
                </p>
                <p className="mt-0.5 truncate text-[11.5px] text-fg-3">
                  {r.currentStep ?? `Submitted ${formatRelativeDate(new Date(r.createdAt).toISOString()).toLowerCase()}`}
                </p>
              </div>
              <CaretDownIcon size={14} className={cn('mt-1 shrink-0 text-fg-3 transition-transform', open === r.id && 'rotate-180')} />
            </button>
            {open === r.id && <div className="bg-muted px-5 py-4">{details(r)}</div>}
          </li>
        ))}
      </ul>

      {/* Tablet and up: table */}
      <div className="hidden overflow-x-auto border-t border-line md:block">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px] text-fg-3">
              {showEmployee && <th className="px-6 py-3 font-medium">Employee</th>}
              <th className={cn('py-3 font-medium', showEmployee ? 'px-3' : 'px-6')}>Type</th>
              <th className="px-3 py-3 font-medium">Dates</th>
              <th className="px-3 py-3 text-right font-medium">Days</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Current step</th>
              <th className="px-3 py-3 font-medium">Submitted</th>
              <th className="w-12 px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {pages.pageItems.map((r) => (
              <Fragment key={r.id}>
                <tr className="trow cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {showEmployee && (
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.employee} size={30} />
                        <span className="font-semibold text-fg">{r.employee}</span>
                      </div>
                    </td>
                  )}
                  <td className={cn('py-3.5 font-semibold text-fg', showEmployee ? 'px-3' : 'px-6')}>{r.type}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-fg-2">{formatDateRange(r.startDate, r.endDate)}</td>
                  <td className="tabular px-3 py-3.5 text-right text-fg">{r.days}</td>
                  <td className="px-3 py-3.5"><RequestStatusBadge status={r.status} /></td>
                  <td className="px-3 py-3.5 text-fg-2">{r.currentStep ?? '–'}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-fg-3">{formatRelativeDate(new Date(r.createdAt).toISOString())}</td>
                  <td className="px-6 py-3.5 text-right">
                    <CaretDownIcon size={14} className={cn('inline text-fg-3 transition-transform', open === r.id && 'rotate-180')} />
                  </td>
                </tr>
                {open === r.id && (
                  <tr className="bg-muted">
                    <td colSpan={showEmployee ? 8 : 7} className="px-6 py-4">
                      {details(r)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager pagination={pages} className="border-t border-line px-5 py-3 md:px-6" />
    </>
  )
}

// ── Who's away ─────────────────────────────────────────────────────────

function WhosAway() {
  const away = useQuery(api.leave.whosAway)
  const pages = usePagination(away ?? [], TABLE_PAGE_SIZE)
  if (!away) return <PageSkeleton rows={1} />
  if (away.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={AirplaneTiltIcon} title="Everyone's in" description="No approved leave in the next 60 days." />
      </div>
    )
  }
  return (
    <Card flush>
      <ul className="divide-y divide-line">
        {pages.pageItems.map((a) => (
          <li key={a.id} className="flex items-center gap-3.5 px-5 py-3.5 md:px-6">
            <Avatar name={a.name} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-fg">{a.name}</p>
              <p className="truncate text-[12px] text-fg-3">{[a.department, a.type].filter(Boolean).join(' · ')}</p>
            </div>
            {a.awayToday && <Badge tone="warning" dot>Away today</Badge>}
            <div className="w-44 shrink-0 text-right">
              <p className="text-[13px] font-semibold text-fg">{formatDateRange(a.startDate, a.endDate)}</p>
              <p className="text-[11.5px] text-fg-3">{a.days} working day{a.days !== 1 ? 's' : ''}</p>
            </div>
          </li>
        ))}
      </ul>
      <Pager pagination={pages} className="border-t border-line px-5 py-3 md:px-6" />
    </Card>
  )
}

// ── HR: register ───────────────────────────────────────────────────────

function Register() {
  const data = useQuery(api.leave.register)
  const [filter, setFilter] = useState<StatusFilter>('pending')
  if (data === undefined) return <PageSkeleton rows={1} />
  if (data === null) return null
  const count = (s: StatusFilter) => (s === 'all' ? data.requests.length : data.requests.filter((r) => r.status === s).length)
  const shown = filter === 'all' ? data.requests : data.requests.filter((r) => r.status === filter)
  return (
    <Card flush>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4 md:p-6 md:pb-4">
        <div>
          <h2 className="font-display text-[17px] font-semibold text-fg">Leave register</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">Every request in the company. Decisions are made in Approvals.</p>
        </div>
        <Segmented
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={(['pending', 'approved', 'declined', 'withdrawn', 'all'] as const).map((s) => ({
            value: s,
            label: s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1),
            count: count(s),
          }))}
        />
      </div>
      <RequestTable key={filter} requests={shown} showEmployee />
    </Card>
  )
}

// ── HR: allowances & types ─────────────────────────────────────────────

function Allowances() {
  const data = useQuery(api.leave.register)
  const setAllowance = useMutation(api.leave.setAllowance)
  const saveType = useMutation(api.leave.saveType)
  const [error, setError] = useState('')
  const [newType, setNewType] = useState('')
  const pages = usePagination(data?.allowances ?? [], TABLE_PAGE_SIZE)

  if (data === undefined) return <PageSkeleton rows={1} />
  if (data === null) return null

  async function attempt(fn: () => Promise<unknown>) {
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
      <Card flush>
        <div className="p-5 pb-4 md:p-6 md:pb-4">
          <h2 className="font-display text-[17px] font-semibold text-fg">Annual allowances · {data.year}</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">
            Default is {data.defaultDays} working days. Change someone&apos;s number to give them more or fewer.
          </p>
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="text-[11.5px] text-fg-3">
                <th className="px-6 py-3 font-medium">Person</th>
                <th className="px-3 py-3 font-medium">Allowance (days)</th>
                <th className="px-3 py-3 text-right font-medium">Taken</th>
                <th className="px-3 py-3 text-right font-medium">Pending</th>
                <th className="px-6 py-3 text-right font-medium">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {pages.pageItems.map((a) => (
                <tr key={a.employeeId} className="trow">
                  <td className="px-6 py-3">
                    <p className="font-semibold text-fg">{a.name}</p>
                    <p className="text-[11.5px] text-fg-3">{a.jobTitle}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        defaultValue={a.entitlement}
                        key={`${a.employeeId}-${a.entitlement}`}
                        className="h-9 w-20"
                        aria-label={`Allowance for ${a.name}`}
                        onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (n !== a.entitlement) void attempt(() => setAllowance({ employeeId: a.employeeId as Id<'employees'>, days: n }))
                        }}
                      />
                      {!a.isDefault && (
                        <button
                          type="button"
                          className="text-[11.5px] font-semibold text-brand"
                          onClick={() => attempt(() => setAllowance({ employeeId: a.employeeId as Id<'employees'>, days: undefined }))}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="tabular px-3 py-3 text-right text-fg">{a.taken}</td>
                  <td className="tabular px-3 py-3 text-right text-fg-2">{a.pending}</td>
                  <td className="tabular px-6 py-3 text-right font-semibold text-fg">{Math.max(0, a.entitlement - a.taken - a.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager pagination={pages} className="border-t border-line px-5 py-3 md:px-6" />
      </Card>

      <Card>
        <h2 className="font-display text-[17px] font-semibold text-fg">Leave types</h2>
        <p className="mb-4 mt-1 text-[12.5px] text-fg-3">Turn types off to stop new requests using them. Existing requests keep their type.</p>
        <ul className="divide-y divide-line rounded-2xl bg-muted">
          {data.types.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <ListChecksIcon size={18} className="text-fg-3" />
              <span className={cn('min-w-0 flex-1 text-[13.5px] font-semibold', t.active ? 'text-fg' : 'text-fg-3 line-through')}>{t.name}</span>
              {t.countsAgainstAllowance && <Badge tone="info">Uses allowance</Badge>}
              {!t.paid && <Badge tone="neutral">Unpaid</Badge>}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => attempt(() => saveType({ id: t.id as Id<'leaveTypes'>, name: t.name, countsAgainstAllowance: t.countsAgainstAllowance, paid: t.paid, active: !t.active }))}
              >
                {t.active ? 'Turn off' : 'Turn on'}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            await attempt(() => saveType({ name: newType, countsAgainstAllowance: false, paid: true, active: true }))
            setNewType('')
          }}
        >
          <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="New leave type, e.g. Study Leave" />
          <button type="submit" className="btn btn-primary shrink-0" disabled={!newType.trim()}>
            <PlusIcon size={16} weight="bold" />
            Add type
          </button>
        </form>
      </Card>
    </div>
  )
}
