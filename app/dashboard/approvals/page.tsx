'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { CalendarBlankIcon, CheckIcon, CheckSquareOffsetIcon, ReceiptIcon, WalletIcon, XIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { api } from '@/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/segmented'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Alert, Field, Textarea } from '@/components/ui/field'
import { EmptyState, PageSkeleton } from '@/components/ui/states'
import { AttachmentList } from '@/components/work/attachments'
import { PayClaimDialog } from '@/components/work/pay-claim-dialog'
import { Pager } from '@/components/ui/pagination'
import { CARD_PAGE_SIZE, TABLE_PAGE_SIZE, usePagination } from '@/lib/use-pagination'
import { cn, errorMessage, formatCurrency, formatDate, formatRelativeDate } from '@/lib/utils'
import type { Currency } from '@/lib/types'

type Inbox = NonNullable<FunctionReturnType<typeof api.approvals.inbox>>
type Item = Inbox['waiting'][number]
type Recent = Inbox['recent'][number]

export default function ApprovalsPage() {
  const inbox = useQuery(api.approvals.inbox)
  const [tab, setTab] = useState<'waiting' | 'others' | 'recent'>('waiting')
  const [declining, setDeclining] = useState<Item | null>(null)
  const [paying, setPaying] = useState<Item | null>(null)
  const list = (tab === 'others' ? inbox?.others : inbox?.waiting) ?? []
  const pages = usePagination(list, CARD_PAGE_SIZE, tab)

  if (!inbox) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Decisions" title="Approvals" />
        <PageSkeleton rows={1} />
      </div>
    )
  }

  const tabs = [
    { value: 'waiting' as const, label: 'Waiting on you', count: inbox.waiting.length },
    ...(inbox.others.length ? [{ value: 'others' as const, label: 'Waiting on others', count: inbox.others.length }] : []),
    { value: 'recent' as const, label: 'Recently decided', count: inbox.recent.length },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decisions"
        title="Approvals"
        description={inbox.waiting.length ? `${inbox.waiting.length} request${inbox.waiting.length !== 1 ? 's' : ''} waiting on you.` : 'Nothing is waiting on you.'}
      />

      <Segmented label="Approvals" options={tabs} value={tab} onChange={setTab} />

      {tab === 'recent' ? (
        <RecentList items={inbox.recent} />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState icon={CheckSquareOffsetIcon} title="Your queue is clear" description="Leave requests and expense claims that need your decision show up here." />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pages.pageItems.map((item) => (
              <ApprovalCard key={`${item.kind}-${item.id}`} item={item} onDecline={() => setDeclining(item)} onPay={() => setPaying(item)} />
            ))}
          </div>
          <Pager pagination={pages} />
        </div>
      )}

      <DeclineDialog item={declining} onClose={() => setDeclining(null)} />
      <PayClaimDialog
        approve
        claim={
          paying
            ? { id: paying.id, title: paying.title, employee: paying.requester, total: paying.amount ?? 0, currency: (paying.currency ?? 'GHS') as Currency }
            : null
        }
        onClose={() => setPaying(null)}
      />
    </div>
  )
}

function KindIcon({ kind }: { kind: Item['kind'] }) {
  const Icon = kind === 'leave' ? CalendarBlankIcon : ReceiptIcon
  return (
    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', kind === 'leave' ? 'badge-info' : 'badge-violet')}>
      <Icon size={19} weight="duotone" />
    </div>
  )
}

function ApprovalCard({ item, onDecline, onPay }: { item: Item; onDecline: () => void; onPay: () => void }) {
  const decide = useMutation(api.approvals.decide)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function approve() {
    setBusy(true)
    setError('')
    try {
      await decide({ kind: item.kind, id: item.id, decision: 'approve' })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-start gap-3.5">
        <KindIcon kind={item.kind} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-semibold text-fg">{item.title}</p>
          <p className="mt-0.5 text-[12.5px] text-fg-2">{item.detail}</p>
        </div>
        {item.amount !== null && (
          <p className="tabular shrink-0 font-display text-[18px] font-semibold text-fg">{formatCurrency(item.amount, item.currency as Currency)}</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <Avatar name={item.requester} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-fg">{item.requester}</p>
          <p className="truncate text-[11.5px] text-fg-3">{item.requesterTitle}</p>
        </div>
        <span className="text-[11.5px] text-fg-3">{formatRelativeDate(new Date(item.createdAt).toISOString())}</span>
      </div>

      {item.reason && <p className="mt-3 rounded-2xl bg-muted px-3.5 py-2.5 text-[12.5px] text-fg-2">{item.reason}</p>}

      {item.items.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-2xl bg-muted">
          {item.items.map((line, i) => (
            <li key={i} className="flex items-center gap-3 px-3.5 py-2 text-[12.5px]">
              <span className="w-20 shrink-0 text-fg-3">{formatDate(line.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg">{line.description}</span>
                <span className="block truncate text-[11px] text-fg-3">{line.category}</span>
              </span>
              <span className="tabular shrink-0 font-semibold text-fg">{formatCurrency(line.amount, item.currency as Currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {item.kind === 'expense' && (
        <div className="mt-3">
          {item.attachments.length > 0 ? (
            <AttachmentList attachments={item.attachments} />
          ) : (
            <p className="text-[12px] font-medium text-warning">No receipts attached.</p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="warning" dot>{item.step} step</Badge>
        {item.onBehalfOf && <Badge tone="neutral">With {item.onBehalfOf}</Badge>}
      </div>

      {error && <div className="mt-3"><Alert icon={WarningCircleIcon}>{error}</Alert></div>}

      <div className="flex-1" />
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button onClick={onDecline} disabled={busy} className="btn btn-secondary">
          <XIcon size={15} weight="bold" />
          Decline
        </button>
        <button
          onClick={approve}
          disabled={busy}
          className={item.canPay ? 'btn btn-secondary' : 'btn btn-primary'}
          title={item.canPay ? 'Approve now and pay later from Expenses' : undefined}
        >
          <CheckIcon size={15} weight="bold" />
          {busy ? 'Approving…' : item.onBehalfOf ? 'Approve on their behalf' : 'Approve'}
        </button>
        {item.canPay && (
          <button onClick={onPay} disabled={busy} className="btn btn-primary">
            <WalletIcon size={15} weight="bold" />
            Approve &amp; pay
          </button>
        )}
      </div>
    </article>
  )
}

function DeclineDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={`Decline ${item?.requester ?? ''}'s request?`} description="They'll see your reason." icon={XIcon} width="30rem">
      {item && <DeclineForm key={item.id} item={item} onClose={onClose} />}
    </Modal>
  )
}

function DeclineForm({ item, onClose }: { item: Item; onClose: () => void }) {
  const decide = useMutation(api.approvals.decide)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        try {
          await decide({ kind: item.kind, id: item.id, decision: 'decline', note })
          onClose()
        } catch (err) {
          setError(errorMessage(err))
          setBusy(false)
        }
      }}
    >
      {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
      <p className="text-[13px] text-fg-2">
        {item.title} · {item.detail}
      </p>
      <Field label="Reason">
        <Textarea required autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. We're short-staffed that week. Could you move it by a week?" />
      </Field>
      <div className="-mx-6 flex justify-end gap-2 border-t border-line px-6 pt-5">
        <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button type="submit" disabled={busy} className="btn btn-danger">{busy ? 'Declining…' : 'Decline'}</button>
      </div>
    </form>
  )
}

function RecentList({ items }: { items: Recent[] }) {
  const pages = usePagination(items, TABLE_PAGE_SIZE)
  if (items.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={CheckSquareOffsetIcon} title="Nothing decided yet" description="Requests you approve or decline will be listed here." />
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-line">
        {pages.pageItems.map((i) => (
          <li key={`${i.kind}-${i.id}`} className="flex items-center gap-3.5 px-5 py-3.5 md:px-6">
            <KindIcon kind={i.kind} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-fg">
                {i.requester} · {i.title}
              </p>
              <p className="truncate text-[12px] text-fg-3">{i.detail}</p>
            </div>
            {i.amount !== null && <span className="tabular hidden text-[13px] font-semibold text-fg sm:inline">{formatCurrency(i.amount, i.currency as Currency)}</span>}
            <Badge tone={i.outcome.decision === 'approved' ? 'success' : 'danger'} dot>
              {i.outcome.decision === 'approved' ? 'Approved' : 'Declined'}
            </Badge>
            <span className="hidden w-24 text-right text-[11.5px] text-fg-3 md:inline">
              {i.outcome.at ? formatRelativeDate(new Date(i.outcome.at).toISOString()) : ''}
            </span>
          </li>
        ))}
      </ul>
      <Pager pagination={pages} className="border-t border-line px-5 py-3 md:px-6" />
    </div>
  )
}
