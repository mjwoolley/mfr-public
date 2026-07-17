"use client";

// Admin expenses view (client half): the table plus create/edit/delete modal
// dialogs, wired to the server actions in @/actions/expenses.

import { useActionState, useEffect, useState } from "react";
import { ModalDialog } from "@mfr/ui";
import { createExpense, deleteExpense, updateExpense, type ActionState } from "@/actions/accounting/expenses";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/accounting/tags";
import { ExpenseCategory } from "@/lib/accounting/enums";

export interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  amountFmt: string;
  category: ExpenseCategory;
  categoryLabel: string;
  categoryClassName: string;
  capital: boolean;
  dateFmt: string;
}

type Modal =
  | { mode: "create" }
  | { mode: "edit"; row: ExpenseRow }
  | { mode: "delete"; row: ExpenseRow }
  | null;

/**
 * The Record/Edit expense dialog. Editing keeps the original date — the date
 * field only exists in create mode; edits show it read-only.
 */
function ExpenseDialog({ row, onClose }: { row: ExpenseRow | null; onClose: () => void }) {
  const isEdit = row !== null;
  const action = isEdit ? updateExpense.bind(null, row.id) : createExpense;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const [capital, setCapital] = useState(row?.capital ?? false);

  useEffect(() => {
    if (state?.success) onClose();
  }, [state, onClose]);

  return (
    <ModalDialog title={isEdit ? "Edit expense" : "Record expense"} onClose={onClose}>
      <form action={formAction} className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor="exp-description">Description</label>
          <input
            id="exp-description"
            name="description"
            className="input"
            required
            defaultValue={row?.description ?? ""}
          />
        </div>
        <div className="flex gap-3">
          <div className="field flex-1">
            <label htmlFor="exp-amount">Amount ($)</label>
            <input
              id="exp-amount"
              name="amount"
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={row ? row.amount : ""}
            />
          </div>
          <div className="field flex-1">
            <label htmlFor="exp-date">Date incurred</label>
            {isEdit ? (
              <input id="exp-date" className="input" value={row.dateFmt} disabled />
            ) : (
              <input id="exp-date" name="incurredAt" className="input" type="date" required />
            )}
          </div>
        </div>
        {isEdit && (
          <p className="text-muted m-0 -mt-1 text-xs">
            Edits keep the original date, so the expense stays in its year.
          </p>
        )}
        <div className="field">
          <label htmlFor="exp-category">Category</label>
          <select
            id="exp-category"
            name="category"
            className="input"
            required
            defaultValue={row?.category ?? "REPAIRS"}
          >
            {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Type</label>
          <input type="hidden" name="capital" value={capital ? "true" : "false"} />
          <div className="seg" style={{ background: "var(--color-surface)" }}>
            <label className="seg-opt">
              <input
                type="radio"
                name="exp-capital-choice"
                checked={!capital}
                onChange={() => setCapital(false)}
              />
              Operating
            </label>
            <label className="seg-opt">
              <input
                type="radio"
                name="exp-capital-choice"
                checked={capital}
                onChange={() => setCapital(true)}
              />
              Capital investment
            </label>
          </div>
        </div>
        {state?.error && (
          <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--color-accent-800)" }}>
            {state.error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save expense" : "Record expense"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function DeleteExpenseDialog({ row, onClose }: { row: ExpenseRow; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteExpense.bind(null, row.id),
    undefined,
  );

  useEffect(() => {
    if (state?.success) onClose();
  }, [state, onClose]);

  return (
    <ModalDialog title="Delete expense" onClose={onClose}>
      <form action={formAction} className="flex flex-col gap-3">
        <p className="m-0 text-sm">
          Delete <span className="font-semibold">{row.description}</span> — {row.amountFmt} on{" "}
          {row.dateFmt}?
        </p>
        <p className="text-muted m-0 text-xs">
          This permanently removes it from the expense log and the income/expense report.
        </p>
        {state?.error && (
          <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--color-accent-800)" }}>
            {state.error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Deleting…" : "Delete expense"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

export function ExpensesAdminClient({ rows }: { rows: ExpenseRow[] }) {
  const [modal, setModal] = useState<Modal>(null);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2.5">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setModal({ mode: "create" })}
        >
          Record expense
        </button>
      </div>

      <h2 className="mb-3.5 text-xl">Expense history</h2>
      <div className="flex flex-col gap-2">
        {rows.map((x) => (
          <div
            key={x.id}
            className="txcard card elev-sm px-4 py-2.5"
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <span className={`${x.categoryClassName} flex-none`}>{x.categoryLabel}</span>
            {x.capital && (
              <span className="tag tag-outline flex-none px-[7px] py-0 text-[10px]">Capital</span>
            )}
            <span className="min-w-0 flex-1 overflow-hidden text-sm text-ellipsis whitespace-nowrap">
              <span className="font-semibold">{x.description}</span>
            </span>
            <span className="text-muted flex-none text-xs whitespace-nowrap">{x.dateFmt}</span>
            <span
              className="flex-none text-base whitespace-nowrap"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {x.amountFmt}
            </span>
            <button
              type="button"
              className="btn btn-secondary flex-none px-3.5 py-1.5"
              onClick={() => setModal({ mode: "edit", row: x })}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-ghost flex-none px-2 py-1.5 text-xs font-semibold"
              style={{ color: "var(--color-accent-800)", fontFamily: "var(--font-body)" }}
              onClick={() => setModal({ mode: "delete", row: x })}
            >
              Delete
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted">No expenses recorded yet.</p>}
      </div>

      {modal && modal.mode !== "delete" && (
        <ExpenseDialog
          row={modal.mode === "edit" ? modal.row : null}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === "delete" && (
        <DeleteExpenseDialog row={modal.row} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
