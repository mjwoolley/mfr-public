"use client";

// Admin transactions view (client half): the table plus the four record
// dialogs (contribution / transfer / adjustment / correction), each wired to
// its server action. The correction dialog posts one `amount_<shareholderId>`
// field per entry on the original — the convention actions/corrections.ts
// parses.

import { useActionState, useEffect, useState } from "react";
import { ModalDialog } from "@mfr/ui";
import { createContribution } from "@/actions/accounting/contributions";
import { createTransfer } from "@/actions/accounting/transfers";
import { createAdjustment } from "@/actions/accounting/adjustments";
import { createCorrection } from "@/actions/accounting/corrections";

type ActionState = { error?: string; success?: boolean } | undefined;
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

export interface TxRow {
  id: string;
  typeLabel: string;
  typeClassName: string;
  dateFmt: string;
  description: string | null;
  recordedBy: string;
  correctsNote: string;
  deleted: boolean;
  entryLine: string;
  entries: { shareholderId: string; shareholderName: string; shares: number }[];
  approvals: { label: string; className: string }[];
}

interface Shareholder {
  id: string;
  name: string;
}

/** Shared dialog chrome: runs the server action, closes itself on success. */
function ActionDialog({
  title,
  action,
  submitLabel,
  onClose,
  children,
}: {
  title: string;
  action: FormAction;
  submitLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  useEffect(() => {
    if (state?.success) onClose();
  }, [state, onClose]);

  return (
    <ModalDialog title={title} onClose={onClose}>
      <form action={formAction} className="flex flex-col gap-3">
        {children}
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
            {pending ? "Recording…" : submitLabel}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function ShareholderSelect({
  name,
  label,
  shareholders,
}: {
  name: string;
  label: string;
  shareholders: Shareholder[];
}) {
  return (
    <div className="field flex-1">
      <label htmlFor={`tx-${name}`}>{label}</label>
      <select id={`tx-${name}`} name={name} className="input" required defaultValue="">
        <option value="" disabled>
          Select a shareholder
        </option>
        {shareholders.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function AmountField({ label, allowNegative }: { label: string; allowNegative?: boolean }) {
  return (
    <div className="field">
      <label htmlFor="tx-amount">{label}</label>
      <input
        id="tx-amount"
        name="amount"
        className="input"
        type="number"
        step="0.01"
        min={allowNegative ? undefined : "0.01"}
        required
      />
    </div>
  );
}

function DescriptionField({
  required,
  label = "Description",
}: {
  required: boolean;
  label?: string;
}) {
  return (
    <div className="field">
      <label htmlFor="tx-description">{label}</label>
      <input
        id="tx-description"
        name="description"
        className="input"
        placeholder="What is this for?"
        required={required}
      />
    </div>
  );
}

type Modal =
  | { mode: "contribution" }
  | { mode: "transfer" }
  | { mode: "adjustment" }
  | { mode: "correction"; row: TxRow }
  | null;

export function TransactionsClient({
  rows,
  shareholders,
  initialCorrectId,
}: {
  rows: TxRow[];
  shareholders: Shareholder[];
  initialCorrectId: string | null;
}) {
  const initialCorrectRow = initialCorrectId
    ? (rows.find((r) => r.id === initialCorrectId) ?? null)
    : null;
  const [modal, setModal] = useState<Modal>(
    initialCorrectRow ? { mode: "correction", row: initialCorrectRow } : null,
  );

  const close = () => setModal(null);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2.5">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setModal({ mode: "contribution" })}
        >
          Record contribution
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setModal({ mode: "transfer" })}
        >
          Record transfer
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setModal({ mode: "adjustment" })}
        >
          Record adjustment
        </button>
      </div>

      <h2 className="mb-3.5 text-xl">History</h2>
      <div className="flex flex-col gap-2">
        {rows.map((t) => (
          <div key={t.id} className="txcard card elev-sm px-4 py-3" style={{ gap: 5 }}>
            <div className="flex items-center gap-2.5">
              <span className={`${t.typeClassName} flex-none`}>{t.typeLabel}</span>
              <span
                className={`min-w-0 text-sm font-semibold ${t.deleted ? "line-through opacity-60" : ""}`}
              >
                {t.entryLine}
              </span>
              {t.deleted && (
                <span className="tag tag-outline flex-none px-[7px] py-0 text-[10px]">
                  Corrected
                </span>
              )}
              <span className="text-muted ml-auto flex-none text-xs whitespace-nowrap">
                {t.dateFmt}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {t.description && <span className="text-muted text-xs">{t.description}</span>}
              {t.correctsNote && <span className="text-muted text-[11px]">· {t.correctsNote}</span>}
              <span className="ml-auto flex flex-wrap items-center gap-[5px]">
                {t.approvals.map((a, i) => (
                  <span key={i} className={`${a.className} px-[7px] py-0 text-[10px]`}>
                    {a.label}
                  </span>
                ))}
                {!t.deleted && (
                  <button
                    type="button"
                    className="btn btn-ghost px-1.5 py-0.5 text-xs font-semibold"
                    style={{ fontFamily: "var(--font-body)" }}
                    onClick={() => setModal({ mode: "correction", row: t })}
                  >
                    Correct
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted">No transactions yet.</p>}
      </div>

      {modal?.mode === "contribution" && (
        <ActionDialog
          title="Record contribution"
          action={createContribution}
          submitLabel="Record contribution"
          onClose={close}
        >
          <ShareholderSelect name="shareholderId" label="Shareholder" shareholders={shareholders} />
          <AmountField label="Amount (USD)" />
          <DescriptionField required={false} />
        </ActionDialog>
      )}

      {modal?.mode === "transfer" && (
        <ActionDialog
          title="Record transfer"
          action={createTransfer}
          submitLabel="Record transfer"
          onClose={close}
        >
          <div className="flex gap-3">
            <ShareholderSelect name="fromShareholderId" label="From" shareholders={shareholders} />
            <ShareholderSelect name="toShareholderId" label="To" shareholders={shareholders} />
          </div>
          <AmountField label="Amount (USD)" />
          <DescriptionField required />
        </ActionDialog>
      )}

      {modal?.mode === "adjustment" && (
        <ActionDialog
          title="Record adjustment"
          action={createAdjustment}
          submitLabel="Record adjustment"
          onClose={close}
        >
          <ShareholderSelect name="shareholderId" label="Shareholder" shareholders={shareholders} />
          <AmountField label="Amount (USD — use a minus sign to reduce)" allowNegative />
          <DescriptionField required label="Reason" />
        </ActionDialog>
      )}

      {modal?.mode === "correction" && (
        <ActionDialog
          title="Record correction"
          action={createCorrection}
          submitLabel="Record correction"
          onClose={close}
        >
          <p className="text-muted m-0 -mt-1.5 text-[13px]">
            Corrects {modal.row.typeLabel.toUpperCase()} #{modal.row.id.slice(-4)} — the original
            will be marked corrected (shown struck through, excluded from totals). Amounts default
            to a full reversal.
          </p>
          <input type="hidden" name="originalTransactionId" value={modal.row.id} />
          {modal.row.entries.map((e) => (
            <div className="field" key={e.shareholderId}>
              <label htmlFor={`amount_${e.shareholderId}`}>
                Correction ($) for {e.shareholderName} — originally {e.shares >= 0 ? "+" : ""}
                {e.shares}
              </label>
              <input
                id={`amount_${e.shareholderId}`}
                name={`amount_${e.shareholderId}`}
                className="input"
                type="number"
                step="0.01"
                required
                defaultValue={(-e.shares).toString()}
              />
            </div>
          ))}
          <DescriptionField required />
        </ActionDialog>
      )}
    </div>
  );
}
