"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendClaimToSupplierAction,
  receiveClaimFromSupplierAction,
  deliverClaimToCustomerAction,
  refundClaimAction,
  rejectClaimAction,
} from "./actions";
import { Button, Card, ErrorBanner, Field, Input, Select, Textarea } from "../../_components/ui";

export interface SupplierOption {
  id: string;
  name: string;
}

const TERMINAL = new Set(["DELIVERED_TO_CUSTOMER", "REFUNDED", "REJECTED"]);

export function ClaimActions({
  claimId,
  status,
  suppliers,
  outstandingMax,
}: {
  claimId: string;
  status: string;
  suppliers: SupplierOption[];
  /** Sale line total for this item — the practical ceiling on a refund. */
  outstandingMax: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [returnToStock, setReturnToStock] = useState(true);
  const [refundAmount, setRefundAmount] = useState(String(outstandingMax));
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showRefund, setShowRefund] = useState(false);

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (TERMINAL.has(status)) {
    return null;
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-3 font-semibold text-brand-blue">Advance claim</h2>

      <div className="flex flex-col gap-4">
        {status === "RECEIVED_FROM_CUSTOMER" ? (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Forward to supplier">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-56">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              disabled={pending || !supplierId}
              onClick={() => run(() => sendClaimToSupplierAction(claimId, supplierId))}
            >
              Send to supplier
            </Button>
          </div>
        ) : null}

        {status === "SENT_TO_SUPPLIER" ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={returnToStock} onChange={(e) => setReturnToStock(e.target.checked)} />
              Return unit to sellable stock
            </label>
            <Button type="button" disabled={pending} onClick={() => run(() => receiveClaimFromSupplierAction(claimId, returnToStock))}>
              Mark received from supplier
            </Button>
          </div>
        ) : null}

        {status === "RECEIVED_FROM_SUPPLIER" ? (
          <div>
            <Button type="button" disabled={pending} onClick={() => run(() => deliverClaimToCustomerAction(claimId))}>
              Mark delivered to customer
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-slate/10 pt-4">
          {!showRefund ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowRefund(true)}>
              Refund instead
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Refund amount">
                <Input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="w-32" />
              </Field>
              <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => run(() => refundClaimAction(claimId, refundAmount))}>
                Confirm refund
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowRefund(false)}>
                Cancel
              </Button>
            </div>
          )}

          {!showReject ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowReject(true)}>
              Reject claim
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Reason for rejection">
                <Textarea rows={2} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} className="w-64" />
              </Field>
              <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => run(() => rejectClaimAction(claimId, rejectNote))}>
                Confirm reject
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowReject(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        {error ? <ErrorBanner message={error} /> : null}
      </div>
    </Card>
  );
}
