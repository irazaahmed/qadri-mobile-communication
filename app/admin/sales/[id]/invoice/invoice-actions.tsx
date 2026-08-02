"use client";

import { useState } from "react";
import { Button } from "../../../_components/ui";

/**
 * Download + Share:
 * - Download triggers the browser print dialog (window.print()); the shop
 *   owner saves as PDF from there. No canvas/vector PDF library is used, per
 *   the invoice-generation skill.
 * - Share opens an inline panel asking which WhatsApp number to send to
 *   (prefilled from the customer's saved phone if there is one, but always
 *   editable — the admin may want to send it to a different number). On
 *   confirm it opens wa.me/<number> directly in that number's chat with the
 *   full itemized bill + payment breakdown prefilled as the message text —
 *   the admin only has to press Send.
 */
export function InvoiceActions({
  invoiceNumber,
  defaultPhone,
  shareText,
}: {
  invoiceNumber: string;
  defaultPhone: string;
  shareText: string;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone);

  function handleSend() {
    const digits = phone.replace(/[^\d]/g, "");
    if (!digits) return;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(shareText)}`, "_blank");
    setOpen(false);
  }

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          Download
        </Button>
        <Button variant="primary" onClick={() => setOpen((v) => !v)}>
          Share
        </Button>
      </div>

      {open ? (
        <div className="w-72 rounded-lg border border-slate/20 bg-surface p-3 text-sm shadow-sm">
          <p className="mb-2 text-xs text-slate">
            WhatsApp number likhein jis ko {invoiceNumber} bhejni hai. OK karte hi WhatsApp us ki chat khol dega,
            bill already likha hoga — bas Send dabayein.
          </p>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="03xxxxxxxxx"
            className="w-full rounded-lg border border-slate/25 bg-surface px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={handleSend} disabled={!phone.replace(/[^\d]/g, "")}>
              Open WhatsApp
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
