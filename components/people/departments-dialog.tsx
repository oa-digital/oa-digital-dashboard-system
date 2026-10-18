"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { BuildingsIcon, CheckIcon, PencilSimpleIcon, PlusIcon, TrashIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Modal } from "@/components/ui/modal";
import { Alert, Input } from "@/components/ui/field";
import { errorMessage } from "@/lib/utils";
import { Pager } from "@/components/ui/pagination";
import { TABLE_PAGE_SIZE, usePagination } from "@/lib/use-pagination";

type Department = { id: string; name: string; headcount: number };

export function DepartmentsDialog({ open, onClose, departments }: { open: boolean; onClose: () => void; departments: Department[] }) {
  const createDepartment = useMutation(api.people.createDepartment);
  const renameDepartment = useMutation(api.people.renameDepartment);
  const deleteDepartment = useMutation(api.people.deleteDepartment);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const pages = usePagination(departments, TABLE_PAGE_SIZE);

  async function attempt(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Departments" description="Rename, add or remove departments." icon={BuildingsIcon} width="30rem">
      <div className="space-y-4">
        {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}

        <ul className="divide-y divide-line rounded-2xl bg-muted">
          {pages.pageItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
              {editingId === d.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await attempt(() => renameDepartment({ id: d.id as Id<"departments">, name: editName }))) setEditingId(null);
                  }}
                >
                  <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
                  <button type="submit" className="icon-btn icon-btn-sm" aria-label="Save name">
                    <CheckIcon size={16} weight="bold" />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="icon-btn icon-btn-sm" aria-label="Cancel">
                    <XIcon size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-fg">{d.name}</p>
                    <p className="text-[11.5px] text-fg-3">
                      {d.headcount} {d.headcount === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(d.id);
                      setEditName(d.name);
                    }}
                    className="icon-btn icon-btn-sm"
                    aria-label={`Rename ${d.name}`}
                    title="Rename"
                  >
                    <PencilSimpleIcon size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => attempt(() => deleteDepartment({ id: d.id as Id<"departments"> }))}
                    className="icon-btn icon-btn-sm icon-btn-danger"
                    aria-label={`Delete ${d.name}`}
                    title={d.headcount ? "Move everyone out first" : "Delete"}
                    disabled={d.headcount > 0}
                  >
                    <TrashIcon size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
          {departments.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-fg-3">No departments yet.</li>}
        </ul>
        <Pager pagination={pages} />

        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await attempt(() => createDepartment({ name: newName }))) setNewName("");
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New department name" />
          <button type="submit" className="btn btn-primary shrink-0" disabled={!newName.trim()}>
            <PlusIcon size={16} weight="bold" />
            Add
          </button>
        </form>
      </div>
    </Modal>
  );
}
