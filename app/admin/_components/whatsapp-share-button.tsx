"use client";

import { useState } from "react";
import { Button } from "./ui";

/**
 * Generic "ask for a WhatsApp number, then open that chat with a prefilled
 * message" button — click opens an inline panel asking which number to send
 * to (prefilled from `defaultPhone` if given, but always editable, since the
 * admin may send to a different number than the one on file). Confirming
 * opens wa.me/<number> directly in that chat with `message` prefilled; the
 * admin only has to press Send. Same pattern used by the sale invoice's
 * Share button (see invoice-generation skill) — extracted here so
 * customer/supplier ledger shares reuse it instead of duplicating the panel.
 */
export function WhatsAppShareButton({
  defaultPhone = "",
  message,
  label = "Share on WhatsApp",
  prompt = "WhatsApp number likhein. OK karte hi WhatsApp us ki chat khol dega, message already likha hoga — bas Send dabayein.",
}: {
  defaultPhone?: string;
  message: string;
  label?: string;
  prompt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone);

  function handleSend() {
    const digits = phone.replace(/[^\d]/g, "");
    if (!digits) return;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank");
    setOpen(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen((v) => !v)}>
        {label}
      </Button>

      {open ? (
        <div className="w-72 rounded-lg border border-slate/20 bg-surface p-3 text-sm shadow-sm">
          <p className="mb-2 text-xs text-slate">{prompt}</p>
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
