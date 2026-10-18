"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { PaperclipIcon, WalletIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Alert, Field, Input } from "@/components/ui/field";
import { errorMessage, formatCurrency } from "@/lib/utils";
import type { Currency } from "@/lib/types";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export type PayableClaim = { id: string; title: string; employee: string; total: number; currency: Currency };

/**
 * Marks an approved claim as paid, with optional proof of payment (invoice, transfer slip) and a reference.
 * With `approve`, a pending claim is approved and paid in one step (from Approvals).
 */
export function PayClaimDialog({ claim, onClose, approve = false }: { claim: PayableClaim | null; onClose: () => void; approve?: boolean }) {
  return (
    <Modal
      open={Boolean(claim)}
      onClose={onClose}
      title={approve ? "Approve and pay" : "Mark as paid"}
      icon={WalletIcon}
      description={claim ? `${claim.employee} · ${claim.title}` : undefined}
      width="32rem"
    >
      {claim && <PayForm key={claim.id} claim={claim} onClose={onClose} approve={approve} />}
    </Modal>
  );
}

function PayForm({ claim, onClose, approve }: { claim: PayableClaim; onClose: () => void; approve: boolean }) {
  const generateUploadUrl = useMutation(api.expenses.generateUploadUrl);
  const markPaid = useMutation(api.expenses.markPaid);
  const approveAndPay = useMutation(api.expenses.approveAndPay);
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`"${tooBig.name}" is over 10 MB.`);
    setError("");
    setFiles((fs) => [...fs, ...picked].slice(0, MAX_FILES));
  }

  async function upload(file: File) {
    const url = await generateUploadUrl();
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return { storageId, name: file.name };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const proof = await Promise.all(files.map(upload));
      const args = { id: claim.id as Id<"expenseClaims">, proof, reference: reference || undefined };
      await (approve ? approveAndPay(args) : markPaid(args));
      onClose();
    } catch (err) {
      setError(err instanceof Error && !("data" in err) ? err.message : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}

      <div className="rounded-2xl bg-muted p-4">
        <p className="text-[12px] text-fg-3">Amount paid to {claim.employee}</p>
        <p className="tabular font-display text-[22px] font-semibold text-fg">{formatCurrency(claim.total, claim.currency)}</p>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-fg-2">Proof of payment</p>
        <p className="mb-2.5 text-[11.5px] text-fg-3">Invoice, bank transfer or mobile money receipt. Images or PDF, up to {MAX_FILES} files, 10 MB each.</p>
        {files.length > 0 && (
          <ul className="mb-2.5 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-muted py-1 pl-3 pr-1 text-[12px] text-fg-2">
                <PaperclipIcon size={13} />
                <span className="max-w-[12rem] truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="icon-btn icon-btn-sm h-6! w-6!" aria-label={`Remove ${f.name}`}>
                  <XIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES} className="btn btn-secondary btn-sm">
          <PaperclipIcon size={14} />
          Attach proof
        </button>
      </div>

      <Field label="Payment reference (optional)">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MoMo transaction ID or bank reference" />
      </Field>

      <p className="text-[11.5px] text-fg-3">{approve ? "Approves the claim, records" : "This also records"} the payment as an expense in Finance, and tells {claim.employee} it&apos;s been paid.</p>

      <ModalActions onClose={onClose} submitLabel={saving ? "Saving…" : approve ? "Approve and pay" : "Mark paid"} />
    </form>
  );
}
