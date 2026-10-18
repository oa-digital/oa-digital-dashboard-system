'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { DealView } from '@/convex/deals'
import type { Id } from '@/convex/_generated/dataModel'
import { KanbanIcon, PlusIcon } from '@phosphor-icons/react'
import { PipelineCard } from '@/components/ui/pipeline-card'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { PHASE_META } from '@/lib/types'
import { AddDealModal, type DealDraft } from '@/components/ui/add-deal-modal'
import { ConfirmDialog } from '@/components/ui/modal'
import { DealPaymentsDialog } from '@/components/ui/deal-payments-dialog'
import { Pager } from '@/components/ui/pagination'
import { CARD_PAGE_SIZE, usePagination } from '@/lib/use-pagination'

const ALL_PHASES = ['all', 'lead', 'proposal', 'await', 'meet', 'action', 'progress', 'done', 'hold'] as const
type FilterPhase = typeof ALL_PHASES[number]

type Deal = DealView

const NO_DEALS: Deal[] = []

function n(v: string | number) { return Number(v) }

function fromDraft(form: DealDraft) {
  return {
    client: form.client.trim(),
    title: form.title.trim(),
    value: Number(form.value) || 0,
    currency: form.currency,
    phase: form.phase,
    ownerId: (form.ownerId || undefined) as Id<'employees'> | undefined,
    nextAction: form.nextAction.trim(),
    notes: form.notes.trim(),
  }
}

function ghsK(v: number) {
  return `GHS ${(v / 1000).toFixed(0)}K`
}

export default function PipelinePage() {
  const [filter, setFilter] = useState<FilterPhase>('all')
  const [dealModalOpen, setDealModalOpen] = useState(false)
  const [editing, setEditing] = useState<Deal | null>(null)
  const [removing, setRemoving] = useState<Deal | null>(null)
  const [paying, setPaying] = useState<Deal | null>(null)
  const dealsData = useQuery(api.deals.list)
  const directory = useQuery(api.people.directory)
  const createDeal = useMutation(api.deals.create)
  const updateDeal = useMutation(api.deals.update)
  const removeDeal = useMutation(api.deals.remove)
  const loading = dealsData === undefined
  const deals = dealsData ?? NO_DEALS
  const people = (directory?.people ?? []).map((p) => ({ id: p.id, name: p.name }))

  function openAdd() {
    setEditing(null)
    setDealModalOpen(true)
  }

  function openEdit(deal: Deal) {
    setEditing(deal)
    setDealModalOpen(true)
  }

  async function handleSave(form: DealDraft) {
    if (editing) await updateDeal({ id: editing.id, ...fromDraft(form) })
    else await createDeal(fromDraft(form))
  }

  async function handleRemove() {
    if (!removing) return
    await removeDeal({ id: removing.id })
    setRemoving(null)
  }

  const filtered = filter === 'all' ? deals : deals.filter((d) => d.phase === filter)
  const pagination = usePagination(filtered, CARD_PAGE_SIZE, filter)
  const totalValue = filtered.reduce((sum, d) => sum + n(d.value), 0)
  const totalPaid  = filtered.reduce((sum, d) => sum + n(d.paid), 0)
  const outstanding = totalValue - totalPaid
  const collectedPct = totalValue > 0 ? (totalPaid / totalValue) * 100 : 0

  const phaseOptions = ALL_PHASES
    .map((phase) => ({
      value: phase,
      label: phase === 'all' ? 'All deals' : PHASE_META[phase].label,
      count: phase === 'all' ? deals.length : deals.filter((d) => d.phase === phase).length,
    }))
    .filter((o) => o.value === 'all' || o.count > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Pipeline"
        description={`${filtered.length} deal${filtered.length !== 1 ? 's' : ''} · ${ghsK(totalValue)} total value`}
        actions={
          <button onClick={openAdd} className="btn btn-primary">
            <PlusIcon size={16} weight="bold" />
            New deal
          </button>
        }
      />

      {/* Value split — proportional pills */}
      {!loading && filtered.length > 0 && (
        <div className="card p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-medium text-fg-3">Total value</p>
              <p className="tabular font-display text-[30px] font-semibold leading-tight text-fg">{ghsK(totalValue)}</p>
            </div>
            <div className="flex gap-8 text-[12px]">
              <div>
                <p className="flex items-center gap-1.5 text-fg-3"><span className="h-2 w-2 rounded-full bg-brand" />Collected</p>
                <p className="tabular mt-0.5 text-[15px] font-semibold text-fg">{ghsK(totalPaid)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-fg-3"><span className="h-2 w-2 rounded-full bg-fg-3/40" />Outstanding</p>
                <p className="tabular mt-0.5 text-[15px] font-semibold text-fg">{ghsK(outstanding)}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex h-11 gap-1.5">
            <div
              className="flex min-w-[3.5rem] items-center rounded-full bg-[#0E1525] px-4 text-[12px] font-semibold text-white dark:bg-white dark:text-[#0E1525]"
            >
              {filtered.length}
            </div>
            {collectedPct > 0 && (
              <div
                className="flex min-w-[4rem] items-center rounded-full px-4 text-[12px] font-semibold text-white"
                style={{ width: `${collectedPct}%`, background: 'var(--brand-gradient)' }}
              >
                {collectedPct.toFixed(0)}%
              </div>
            )}
            {collectedPct < 100 && (
              <div
                className="hatch flex min-w-[4rem] flex-1 items-center rounded-full px-4 text-[12px] font-semibold text-fg-2"
              >
                {(100 - collectedPct).toFixed(0)}%
              </div>
            )}
          </div>
        </div>
      )}

      <Segmented label="Filter by phase" options={phaseOptions} value={filter} onChange={setFilter} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-[22px]" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={KanbanIcon}
            title={filter === 'all' ? 'No deals yet' : 'No deals in this phase'}
            description={filter === 'all' ? 'Add your first deal to start tracking the pipeline.' : 'Try another phase or add a new deal.'}
            action={
              <button onClick={openAdd} className="btn btn-primary">
                <PlusIcon size={16} weight="bold" />
                New deal
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {pagination.pageItems.map((deal) => (
              <PipelineCard
                key={deal.id}
                deal={deal}
                onEdit={() => openEdit(deal)}
                onDelete={() => setRemoving(deal)}
                onPayments={() => setPaying(deal)}
              />
            ))}
          </div>
          <Pager pagination={pagination} />
        </div>
      )}

      <AddDealModal
        open={dealModalOpen}
        onClose={() => { setDealModalOpen(false); setEditing(null) }}
        initial={editing ? {
          id: editing.id,
          client: editing.client,
          title: editing.title,
          value: String(n(editing.value)),
          currency: editing.currency,
          phase: editing.phase,
          ownerId: editing.ownerId ?? '',
          nextAction: editing.nextAction,
          notes: editing.notes,
        } : null}
        people={people}
        onSave={handleSave}
      />

      <DealPaymentsDialog deal={paying ? (deals.find((d) => d.id === paying.id) ?? null) : null} onClose={() => setPaying(null)} />

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove deal?"
        message={removing ? `This will permanently remove “${removing.client} — ${removing.title}” from the pipeline. Payments already recorded stay in Finance.` : ''}
        confirmLabel="Remove deal"
        onClose={() => setRemoving(null)}
        onConfirm={handleRemove}
      />
    </div>
  )
}
