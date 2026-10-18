'use client'

import { useState, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ChartLineUpIcon, PlusIcon, ReceiptIcon, TrashIcon, TrendUpIcon } from '@phosphor-icons/react'
import type { Id } from '@/convex/_generated/dataModel'
import type { TransactionView } from '@/convex/transactions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardHeader } from '@/components/ui/card'
import { StatStrip } from '@/components/ui/stat-strip'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState, PageSkeleton, Progress } from '@/components/ui/states'
import { Avatar } from '@/components/ui/avatar'
import { CashCard, InkMetric, TransactionRow } from '@/components/dashboard/widgets'
import { errorMessage, formatCurrency } from '@/lib/utils'
import type { TransactionType } from '@/lib/types'
import { AddTransactionModal } from '@/components/ui/add-transaction-modal'
import { ConfirmDialog } from '@/components/ui/modal'
import { Pager } from '@/components/ui/pagination'
import { TABLE_PAGE_SIZE, usePagination } from '@/lib/use-pagination'

const TX_TYPES = ['all', 'income', 'payment_received', 'expense', 'transfer'] as const
type FilterType = typeof TX_TYPES[number]
const TYPE_LABEL: Record<TransactionType | 'all', string> = {
  all: 'All', income: 'Income', payment_received: 'Received', expense: 'Expenses', transfer: 'Transfers',
}

type Deal = { id: string; client: string; title: string; value: string | number; currency: string; phase: string; paid: string | number; nextAction: string }

const NO_DEALS: Deal[] = []

function n(v: string | number) { return Number(v) }
function ghsK(v: number) { return `GHS ${(v / 1000).toFixed(0)}K` }

export default function FinancePage() {
  const [filter, setFilter] = useState<FilterType>('all')
  const [txModalOpen, setTxModalOpen] = useState(false)
  const txData = useQuery(api.transactions.list)
  const dealsData = useQuery(api.deals.list)
  const createTransaction = useMutation(api.transactions.create)
  const removeTransaction = useMutation(api.transactions.remove)
  const [removing, setRemoving] = useState<TransactionView | null>(null)
  const [removeError, setRemoveError] = useState('')
  const loading = txData === undefined || dealsData === undefined
  const transactions = useMemo(() => txData ?? [], [txData])
  const deals: Deal[] = dealsData ?? NO_DEALS

  const filtered = filter === 'all' ? transactions : transactions.filter((t) => t.type === filter)
  const outstanding = deals.filter(d => n(d.value) - n(d.paid) > 0 && d.phase !== 'done')
  const txPages = usePagination(filtered, TABLE_PAGE_SIZE, filter)

  const kpi = useMemo(() => {
    const ghsTx = transactions.filter(t => t.currency === 'GHS')
    const usdTx = transactions.filter(t => t.currency === 'USD')
    const ghsIn  = ghsTx.filter(t => t.type === 'income' || t.type === 'payment_received').reduce((s, t) => s + n(t.amount), 0)
    const ghsOut = ghsTx.filter(t => t.type === 'expense').reduce((s, t) => s + n(t.amount), 0)
    const usdIn  = usdTx.filter(t => t.type === 'income' || t.type === 'payment_received').reduce((s, t) => s + n(t.amount), 0)
    const usdOut = usdTx.filter(t => t.type === 'expense').reduce((s, t) => s + n(t.amount), 0)
    return { revenueGHS: ghsIn, expensesGHS: ghsOut, profitGHS: ghsIn - ghsOut, balanceGHS: ghsIn - ghsOut, balanceUSD: usdIn - usdOut }
  }, [transactions])

  const typeOptions = TX_TYPES.map((type) => ({
    value: type,
    label: TYPE_LABEL[type],
    count: type === 'all' ? transactions.length : transactions.filter((t) => t.type === type).length,
  }))

  const totalOwed = outstanding.reduce((s, d) => s + (n(d.value) - n(d.paid)), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Finance"
        description="Account balances, cash flow and every transaction."
        actions={
          <button onClick={() => setTxModalOpen(true)} className="btn btn-primary">
            <PlusIcon size={16} weight="bold" />
            New transaction
          </button>
        }
      />

      {loading ? (
        <PageSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="space-y-5 xl:col-span-8">
              <StatStrip
                stats={[
                  { label: 'Revenue', value: ghsK(kpi.revenueGHS), icon: ChartLineUpIcon, hint: formatCurrency(kpi.revenueGHS, 'GHS'), trend: 'up' },
                  { label: 'Expenses', value: ghsK(kpi.expensesGHS), icon: ReceiptIcon, hint: formatCurrency(kpi.expensesGHS, 'GHS'), trend: 'down' },
                  { label: 'Profit', value: ghsK(kpi.profitGHS), icon: TrendUpIcon, hint: kpi.revenueGHS > 0 ? `${((kpi.profitGHS / kpi.revenueGHS) * 100).toFixed(0)}% margin` : '—', trend: kpi.profitGHS >= 0 ? 'up' : 'down' },
                ]}
              />
              <OutstandingCard deals={outstanding} />
            </div>
            <CashCard
              className="xl:sticky xl:top-0 xl:col-span-4 xl:self-start"
              balanceGHS={kpi.balanceGHS}
              balanceUSD={kpi.balanceUSD}
              footer={
                <>
                  <InkMetric label="Spend ratio" value={kpi.revenueGHS > 0 ? `${((kpi.expensesGHS / kpi.revenueGHS) * 100).toFixed(0)}%` : '—'} tone="warm" />
                  <InkMetric label="Owed to us" value={ghsK(totalOwed)} />
                </>
              }
            />
          </div>


          <Card flush>
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 md:p-6">
              <div>
                <h2 className="font-display text-[17px] font-semibold text-fg">Transactions</h2>
                <p className="mt-1 text-[12.5px] text-fg-3">{filtered.length} records</p>
              </div>
              <Segmented label="Filter by type" options={typeOptions} value={filter} onChange={setFilter} />
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={ReceiptIcon}
                title="No transactions"
                description="Nothing matches this filter yet."
                className="border-t border-line"
              />
            ) : (
              <>
                <div className="divide-y divide-line border-t border-line">
                  {txPages.pageItems.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      showType
                      action={
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveError('')
                            setRemoving(tx)
                          }}
                          className="icon-btn icon-btn-sm icon-btn-danger -mr-2 shrink-0"
                          aria-label={`Delete ${tx.description}`}
                          title="Delete"
                        >
                          <TrashIcon size={16} />
                        </button>
                      }
                    />
                  ))}
                </div>
                <Pager pagination={txPages} className="border-t border-line px-5 py-3 md:px-6" />
              </>
            )}
          </Card>
        </>
      )}

      <AddTransactionModal
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        deals={deals.map((d) => ({ id: d.id, client: d.client, title: d.title, currency: d.currency, value: n(d.value), paid: n(d.paid) }))}
        onAdd={async (form) => {
          await createTransaction({
            type: form.type,
            description: form.description,
            amount: Number(form.amount) || 0,
            currency: form.currency,
            category: form.category,
            person: form.person,
            dealId: (form.dealId || undefined) as Id<'deals'> | undefined,
          })
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete transaction?"
        message={
          removeError ||
          (removing
            ? `“${removing.description}” (${formatCurrency(removing.amount, removing.currency)}) will be removed from Finance.${removing.dealId ? ' It is a payment on a deal, so the deal’s collected amount goes down too.' : ''}`
            : '')
        }
        confirmLabel="Delete"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await removeTransaction({ id: removing.id })
            setRemoving(null)
          } catch (err) {
            setRemoveError(errorMessage(err))
          }
        }}
      />
    </div>
  )
}

function OutstandingCard({ deals }: { deals: Deal[] }) {
  const pages = usePagination(deals, TABLE_PAGE_SIZE)
  if (deals.length === 0) return null
  return (
    <Card flush>
      <div className="p-5 pb-0 md:p-6 md:pb-0">
        <CardHeader
          title="Outstanding payments"
          description="Balances still to collect"
          action={<span className="badge badge-warning">{deals.length} to follow up</span>}
          className="mb-3"
        />
      </div>
      <ul className="divide-y divide-line">
        {pages.pageItems.map((deal) => {
          const owed = n(deal.value) - n(deal.paid)
          const pct = n(deal.value) > 0 ? Math.round((n(deal.paid) / n(deal.value)) * 100) : 0
          const cur = deal.currency as 'GHS' | 'USD'
          return (
            <li key={deal.id} className="trow flex items-center gap-3.5 px-5 py-3.5 md:px-6">
              <Avatar name={deal.client} size={40} square />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-fg">{deal.client}</p>
                <p className="truncate text-[12px] text-fg-3">{deal.nextAction || deal.title}</p>
              </div>
              <div className="hidden w-32 sm:block">
                <Progress value={pct} className="h-1.5" tone="warm" />
                <p className="mt-1 text-[11px] text-fg-3">{pct}% paid</p>
              </div>
              <div className="w-32 shrink-0 text-right">
                <p className="tabular text-[13.5px] font-semibold text-warning">{formatCurrency(owed, cur)}</p>
                <p className="tabular text-[11px] text-fg-3">of {formatCurrency(n(deal.value), cur)}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <Pager pagination={pages} className="border-t border-line px-5 py-3 md:px-6" />
    </Card>
  )
}
