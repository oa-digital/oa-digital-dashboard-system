"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { TrashIcon, WalletIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { DealView } from "@/convex/deals";
import type { Id } from "@/convex/_generated/dataModel";
import { Modal, Field, Input } from "./modal";
import { Alert } from "./field";
import { Progress, Skeleton } from "./states";
import { errorMessage, formatCurrency, formatDate } from "@/lib/utils";

/** Record client payments on a deal. Each one is also a "Payment received" in Finance. */
export function DealPaymentsDialog({ deal, onClose }: { deal: DealView | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(deal)}
      onClose={onClose}
      title="Payments"
      icon={WalletIcon}
      description={deal ? `${deal.client} · ${deal.title}` : undefined}
      width="32rem"
    >
      {deal && <PaymentsBody key={deal.id} deal={deal} />}
    </Modal>
  );
}

function PaymentsBody({ deal }: { deal: DealView }) {
  const data = useQuery(api.deals.payments, { id: deal.id as Id<"deals"> });
  const record = useMutation(api.deals.recordPayment);
  const removePayment = useMutation(api.deals.removePayment);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const remaining = Math.max(0, deal.value - deal.paid);
  const pct = deal.value > 0 ? (deal.paid / deal.value) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await record({ id: deal.id as Id<"deals">, amount: Number(amount), date, note: note || undefined });
      setAmount("");
      setNote("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setError("");
    try {
      await removePayment({ transactionId: id as Id<"transactions"> });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-muted p-4">
        <div className="flex items-end justify-between gap-3 text-[12px]">
          <div>
            <p className="text-fg-3">Collected</p>
            <p className="tabular font-display text-[20px] font-semibold text-fg">{formatCurrency(deal.paid, deal.currency)}</p>
          </div>
          <div className="text-right">
            <p className="text-fg-3">Remaining</p>
            <p className="tabular text-[14px] font-semibold text-warning">{formatCurrency(remaining, deal.currency)}</p>
          </div>
        </div>
        <Progress value={pct} className="mt-3 h-1.5" tone={pct >= 100 ? "success" : "brand"} />
        <p className="mt-1.5 text-[11.5px] text-fg-3">of {formatCurrency(deal.value, deal.currency)} deal value</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Amount (${deal.currency})`}>
            <Input
              required
              type="number"
              min="0.01"
              step="0.01"
              placeholder={remaining > 0 ? remaining.toFixed(2) : "0.00"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Date received">
            <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <Input placeholder="e.g. Invoice #42, second instalment" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-fg-3">Also recorded in Finance as a payment received.</p>
          <button type="submit" disabled={busy} className="btn btn-primary shrink-0">
            {busy ? "Saving…" : "Record payment"}
          </button>
        </div>
      </form>

      <div>
        <p className="eyebrow mb-2">History</p>
        {data === undefined ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : data === null || (data.payments.length === 0 && data.opening === 0) ? (
          <p className="rounded-2xl bg-muted px-4 py-5 text-center text-[12.5px] text-fg-3">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl bg-muted">
            {data.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                <span className="w-24 shrink-0 text-fg-3">{formatDate(p.date)}</span>
                <span className="min-w-0 flex-1 truncate text-fg-2">{p.description}</span>
                <span className="tabular shrink-0 font-semibold text-fg">{formatCurrency(p.amount, p.currency)}</span>
                {confirming === p.id ? (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => handleRemove(p.id)} className="btn btn-danger btn-sm">Delete</button>
                    <button type="button" onClick={() => setConfirming(null)} className="btn btn-secondary btn-sm">Keep</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(p.id)}
                    className="icon-btn icon-btn-sm icon-btn-danger shrink-0"
                    aria-label="Delete payment"
                    title="Delete payment (also removes it from Finance)"
                  >
                    <TrashIcon size={15} />
                  </button>
                )}
              </li>
            ))}
            {data.opening > 0 && (
              <li className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
                <span className="w-24 shrink-0 text-fg-3">Earlier</span>
                <span className="min-w-0 flex-1 truncate text-fg-3">Collected before payments were tracked</span>
                <span className="tabular shrink-0 font-semibold text-fg">{formatCurrency(data.opening, deal.currency)}</span>
                <span className="w-8 shrink-0" />
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
