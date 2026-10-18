'use client'

import { Fragment, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import {
  CaretDownIcon,
  CheckCircleIcon,
  ClockIcon,
  CoinsIcon,
  PlusIcon,
  ReceiptIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import { api } from '@/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import { PageHeader } from '@/components/ui/page-header'
import { StatStrip } from '@/components/ui/stat-strip'
import { Segmented } from '@/components/ui/segmented'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState, PageSkeleton } from '@/components/ui/states'
import { ConfirmDialog } from '@/components/ui/modal'
import { RequestStatusBadge, StepsTimeline } from '@/components/work/request-status'
import { ExpenseClaimDialog } from '@/components/work/expense-claim-dialog'
import { PayClaimDialog } from '@/components/work/pay-claim-dialog'
import { AttachmentList } from '@/components/work/attachments'
import { Pager } from '@/components/ui/pagination'
import { TABLE_PAGE_SIZE, usePagination } from '@/lib/use-pagination'
import { useRole } from '@/lib/role-context'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type Claim = NonNullable<FunctionReturnType<typeof api.expenses.mine>>['claims'][number]
type Summary = NonNullable<FunctionReturnType<typeof api.expenses.mine>>['summary']
type StatusFilter = 'all' | Claim['status']

export default function ExpensesPage() {
  return (
    <Suspense>
      <ExpensesContent />
    </Suspense>
  )
}

function ExpensesContent() {
  const { can } = useRole()
  const router = useRouter()
  const tab = useSearchParams().get('tab') ?? 'mine'
  const mine = useQuery(api.expenses.mine)
  const canSeeAll = can('finance.view') || can('hr.manage')
  const all = useQuery(api.expenses.all, canSeeAll && tab === 'all' ? {} : 'skip')
  const [newOpen, setNewOpen] = useState(false)

  const header = (
    <PageHeader
      eyebrow="Money back"
      title="Expenses"
      description="Claim back what you spent for work. The CEO approves it, then it's paid."
      actions={
        <button onClick={() => setNewOpen(true)} className="btn btn-primary" disabled={!mine}>
          <PlusIcon size={17} weight="bold" />
          New claim
        </button>
      }
    />
  )

  if (!mine) {
    return (
      <div className="space-y-6">
        {header}
        <PageSkeleton />
      </div>
    )
  }

  const showingAll = tab === 'all' && canSeeAll
  const summary = showingAll && all ? all.summary : mine.summary

  return (
    <div className="space-y-6">
      {header}
      <SummaryStats summary={summary} />

      {canSeeAll && (
        <Segmented
          label="Whose claims"
          value={showingAll ? 'all' : 'mine'}
          onChange={(v) => router.replace(`/dashboard/expenses?tab=${v}`)}
          options={[
            { value: 'mine', label: 'My claims' },
            { value: 'all', label: 'All claims' },
          ]}
        />
      )}

      {showingAll ? (
        all ? (
          <ClaimsCard claims={all.claims} showEmployee canPay={all.canPay} />
        ) : (
          <PageSkeleton rows={1} />
        )
      ) : mine.claims.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ReceiptIcon}
            title="No claims yet"
            description="Spent your own money on work? Submit a claim with your receipts to get paid back."
            action={
              <button onClick={() => setNewOpen(true)} className="btn btn-primary">
                <PlusIcon size={16} weight="bold" />
                New claim
              </button>
            }
          />
        </div>
      ) : (
        <ClaimsCard claims={mine.claims} showEmployee={false} canPay={false} />
      )}

      <ExpenseClaimDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        categories={mine.categories}
        autoApproved={mine.autoApproved}
        route={mine.route}
      />
    </div>
  )
}

function SummaryStats({ summary }: { summary: Summary }) {
  const ghs = (n: number) => formatCurrency(n, 'GHS')
  return (
    <StatStrip
      stats={[
        { label: 'In approval', value: String(summary.inApproval.count), icon: ClockIcon, hint: ghs(summary.inApproval.total) },
        { label: 'Approved, to be paid', value: ghs(summary.toPay.total), icon: WalletIcon, hint: `${summary.toPay.count} claim${summary.toPay.count !== 1 ? 's' : ''}` },
        { label: `Paid in ${new Date().getFullYear()}`, value: ghs(summary.paidThisYear.total), icon: CheckCircleIcon, hint: `${summary.paidThisYear.count} claim${summary.paidThisYear.count !== 1 ? 's' : ''}` },
        { label: 'All claims', value: String(summary.all), icon: CoinsIcon },
      ]}
    />
  )
}

function ClaimsCard({ claims, showEmployee, canPay }: { claims: Claim[]; showEmployee: boolean; canPay: boolean }) {
  const [filter, setFilter] = useState<StatusFilter>(showEmployee ? 'approved' : 'all')
  const [open, setOpen] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState<Claim | null>(null)
  const [paying, setPaying] = useState<Claim | null>(null)
  const withdraw = useMutation(api.expenses.withdraw)

  const statuses = ['all', 'pending', 'approved', 'paid', 'declined', 'withdrawn'] as const
  const label = (s: StatusFilter) => (s === 'all' ? 'All' : s === 'approved' ? 'To pay' : s[0].toUpperCase() + s.slice(1))
  const shown = filter === 'all' ? claims : claims.filter((c) => c.status === filter)
  const pages = usePagination(shown, TABLE_PAGE_SIZE, filter)

  const details = (c: Claim) => (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="eyebrow mb-2">Expenses</p>
        <ul className="divide-y divide-line rounded-2xl bg-solid">
          {c.items.map((i, idx) => (
            <li key={idx} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
              <span className="w-24 shrink-0 text-fg-3">{formatDate(i.date)}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{i.description}</span>
              <span className="hidden text-fg-3 sm:inline">{i.category}</span>
              <span className="tabular w-28 text-right font-semibold text-fg">{formatCurrency(i.amount, c.currency)}</span>
            </li>
          ))}
        </ul>
        {c.receipts.length > 0 && (
          <div className="mt-3">
            <AttachmentList attachments={c.receipts} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!showEmployee && c.canWithdraw && (
            <button onClick={() => setWithdrawing(c)} className="btn btn-secondary btn-sm">
              Withdraw claim
            </button>
          )}
          {canPay && c.status === 'approved' && (
            <button
              onClick={() => setPaying(c)}
              className="btn btn-primary btn-sm"
            >
              <CheckCircleIcon size={14} weight="bold" />
              Mark as paid
            </button>
          )}
        </div>
      </div>
      <div>
        <p className="eyebrow mb-2">Approval</p>
        <StepsTimeline steps={c.steps} autoApproved requestStatus={c.status} />
        {c.paidBy && (
          <p className="mt-3 text-[12.5px] text-fg-3">
            Paid by {c.paidBy}
            {c.paymentReference && <> · Ref {c.paymentReference}</>}
          </p>
        )}
        {c.paymentProof.length > 0 && (
          <div className="mt-3">
            <AttachmentList attachments={c.paymentProof} label="Proof of payment" />
          </div>
        )}
      </div>
    </div>
  )


  return (
    <Card flush>
      <div className="p-5 pb-4 md:p-6 md:pb-4">
        <Segmented
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={statuses.map((s) => ({ value: s, label: label(s), count: s === 'all' ? claims.length : claims.filter((c) => c.status === s).length }))}
        />
      </div>
      {shown.length === 0 ? (
        <p className="border-t border-line px-6 py-10 text-center text-[13px] text-fg-3">Nothing here.</p>
      ) : (
        <>
          {/* Phones: stacked cards */}
          <ul className="divide-y divide-line border-t border-line md:hidden">
            {pages.pageItems.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="trow flex w-full items-start gap-3 px-5 py-3.5 text-left" aria-expanded={open === c.id}>
                  {showEmployee && <Avatar name={c.employee} size={34} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[13.5px] font-semibold text-fg">{c.title}</p>
                      <p className="tabular shrink-0 text-[13.5px] font-semibold text-fg">{formatCurrency(c.total, c.currency)}</p>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-fg-3">
                      {showEmployee && `${c.employee} · `}
                      {formatDate(new Date(c.createdAt).toISOString())} · {c.items.length} expense{c.items.length !== 1 ? 's' : ''}
                      {c.receipts.length > 0 && ` · ${c.receipts.length} receipt${c.receipts.length !== 1 ? 's' : ''}`}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <RequestStatusBadge status={c.status} labelOverride={c.status === 'approved' ? 'Approved · to pay' : undefined} />
                      {c.currentStep && c.status === 'pending' && <span className="text-[11.5px] text-fg-3">{c.currentStep}</span>}
                    </div>
                  </div>
                  <CaretDownIcon size={14} className={cn('mt-1 shrink-0 text-fg-3 transition-transform', open === c.id && 'rotate-180')} />
                </button>
                {open === c.id && <div className="bg-muted px-5 py-4">{details(c)}</div>}
              </li>
            ))}
          </ul>

          {/* Tablet and up: table */}
          <div className="hidden overflow-x-auto border-t border-line md:block">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="text-[11.5px] text-fg-3">
                  <th className="px-6 py-3 font-medium">Submitted</th>
                  {showEmployee && <th className="px-3 py-3 font-medium">Claimant</th>}
                  <th className="px-3 py-3 font-medium">Claim</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Step</th>
                  <th className="w-12 px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {pages.pageItems.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="trow cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                      <td className="whitespace-nowrap px-6 py-3.5 text-fg-2">{formatDate(new Date(c.createdAt).toISOString())}</td>
                      {showEmployee && (
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={c.employee} size={30} />
                            <span className="font-semibold text-fg">{c.employee}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-3.5">
                        <p className="font-semibold text-fg">{c.title}</p>
                        <p className="text-[11.5px] text-fg-3">
                          {c.items.length} expense{c.items.length !== 1 ? 's' : ''} · {[...new Set(c.items.map((i) => i.category))].join(', ')}
                          {c.receipts.length > 0 && ` · ${c.receipts.length} receipt${c.receipts.length !== 1 ? 's' : ''}`}
                        </p>
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-3.5 text-right font-semibold text-fg">{formatCurrency(c.total, c.currency)}</td>
                      <td className="px-3 py-3.5"><RequestStatusBadge status={c.status} labelOverride={c.status === 'approved' ? 'Approved · to pay' : undefined} /></td>
                      <td className="px-3 py-3.5 text-fg-2">{c.status === 'paid' ? `Paid ${c.paidAt ? formatDate(new Date(c.paidAt).toISOString()) : ''}` : (c.currentStep ?? '–')}</td>
                      <td className="px-6 py-3.5 text-right">
                        <CaretDownIcon size={14} className={cn('inline text-fg-3 transition-transform', open === c.id && 'rotate-180')} />
                      </td>
                    </tr>
                    {open === c.id && (
                      <tr className="bg-muted">
                        <td colSpan={showEmployee ? 7 : 6} className="px-6 py-4">
                          {details(c)}
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
      )}

      <ConfirmDialog
        open={Boolean(withdrawing)}
        title="Withdraw this claim?"
        message={withdrawing ? `"${withdrawing.title}" (${formatCurrency(withdrawing.total, withdrawing.currency)}) will be removed from approval.` : ''}
        confirmLabel="Withdraw"
        onClose={() => setWithdrawing(null)}
        onConfirm={async () => {
          if (withdrawing) await withdraw({ id: withdrawing.id })
          setWithdrawing(null)
        }}
      />
      <PayClaimDialog claim={paying} onClose={() => setPaying(null)} />
    </Card>
  )
}
