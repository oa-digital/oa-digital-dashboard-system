"use client";

import { useState } from "react";
import { ReceiptIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Modal, Field, Input, Select, ModalActions } from "./modal";
import { Alert } from "./field";
import { errorMessage, formatCurrency } from "@/lib/utils";

const CURRENCIES = ["GHS", "USD"] as const;
const TYPES = [
  { value: "income", label: "Income" },
  { value: "payment_received", label: "Payment received" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
] as const;
const CATEGORIES = [
  "Client Payment", "Salary", "Software & Tools", "Marketing",
  "Office & Supplies", "Travel", "Freelance", "Tax", "Other",
];

/** A deal a payment can be linked to. */
export type LinkableDeal = { id: string; client: string; title: string; currency: string; value: number; paid: number };

interface AddTransactionModalProps {
  open: boolean;
  onClose: () => void;
  onAdd?: (transaction: TransactionDraft) => void | Promise<void>;
  deals?: LinkableDeal[];
}

export interface TransactionDraft {
  description: string;
  amount: string;
  currency: (typeof CURRENCIES)[number];
  type: (typeof TYPES)[number]["value"];
  category: string;
  person: string;
  /** Deal this payment is for, or "" for none. */
  dealId: string;
}

const empty: TransactionDraft = {
  description: "", amount: "", currency: "GHS",
  type: "income", category: CATEGORIES[0], person: "", dealId: "",
};

export function AddTransactionModal({ open, onClose, onAdd, deals = [] }: AddTransactionModalProps) {
  const [form, setForm] = useState<TransactionDraft>(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isMoneyIn = form.type === "income" || form.type === "payment_received";
  const dealOptions = deals.filter((d) => d.currency === form.currency);

  function set<K extends keyof TransactionDraft>(k: K, v: TransactionDraft[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // A deal link only makes sense for money in, in the deal's currency.
      const deal = deals.find((d) => d.id === next.dealId);
      const moneyIn = next.type === "income" || next.type === "payment_received";
      if (deal && (!moneyIn || deal.currency !== next.currency)) next.dealId = "";
      return next;
    });
  }

  function chooseDeal(id: string) {
    const deal = deals.find((d) => d.id === id);
    setForm((f) =>
      deal
        ? { ...f, dealId: id, category: "Client Payment", person: deal.client, description: f.description || `${deal.client}: ${deal.title}` }
        : { ...f, dealId: "" },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onAdd?.(form);
      setForm(empty);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setForm(empty);
    setError("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="New transaction" icon={ReceiptIcon} description="Record money coming in or going out." width="32rem">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
        <Field label="Description">
          <Input
            required
            placeholder="e.g. Invoice #42 — Accra Motors"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <Select
              value={form.currency}
              onChange={(e) => set("currency", e.target.value as TransactionDraft["currency"])}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => set("type", e.target.value as TransactionDraft["type"])}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>

        {isMoneyIn && dealOptions.length > 0 && (
          <Field label="For deal (optional)">
            <Select value={form.dealId} onChange={(e) => chooseDeal(e.target.value)}>
              <option value="">Not linked to a deal</option>
              {dealOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.client} · {d.title} ({formatCurrency(Math.max(0, d.value - d.paid), d.currency as "GHS" | "USD")} left)
                </option>
              ))}
            </Select>
            {form.dealId && <p className="mt-1.5 text-[11.5px] text-fg-3">This also counts toward the deal&apos;s collected amount in Pipeline.</p>}
          </Field>
        )}

        <Field label="Person / Client (optional)">
          <Input
            placeholder="e.g. Kofi Mensah"
            value={form.person}
            onChange={(e) => set("person", e.target.value)}
          />
        </Field>

        <ModalActions onClose={handleClose} submitLabel={busy ? "Saving…" : "Save transaction"} />
      </form>
    </Modal>
  );
}
