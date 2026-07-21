"use client";

import { useState } from "react";
import { Button } from "../../../_components/ui";

/**
 * Download + Share per the invoice-generation skill:
 * - Download triggers the browser print dialog (window.print()); the shop
 *   owner saves as PDF from there. No canvas/vector PDF library is used.
 * - Share uses the Web Share API. True Level 2 file-attach share (handing a
 *   PDF Blob to navigator.share so WhatsApp gets it as an attachment)
 *   requires an actual PDF File object — generating one would mean pulling
 *   in a PDF-rendering library, which this skill explicitly rules out in
 *   favor of browser-native printing. So this feature-detects
 *   `navigator.share` (Level 1, title/text/url only) for mobile share
 *   sheets, and on any browser without it falls back to opening
 *   `wa.me/<phone>` with a prefilled note plus triggering print so the
 *   owner can attach the saved PDF manually.
 * - Hidden entirely when there's no customer phone on the sale.
 */
export function InvoiceActions({
  invoiceNumber,
  customerPhone,
  shareText,
}: {
  invoiceNumber: string;
  customerPhone: string | null;
  shareText: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  async function handleShare() {
    setNotice(null);

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Invoice ${invoiceNumber}`, text: shareText });
        return;
      } catch {
        // User cancelled or share failed — fall through to the manual fallback below.
      }
    }

    if (customerPhone) {
      const digits = customerPhone.replace(/[^\d]/g, "");
      window.print();
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(shareText)}`, "_blank");
      setNotice("Opened WhatsApp — attach the downloaded/printed PDF manually.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          Download
        </Button>
        {customerPhone ? (
          <Button variant="primary" onClick={handleShare}>
            Share
          </Button>
        ) : null}
      </div>
      {notice ? <p className="text-xs text-slate">{notice}</p> : null}
    </div>
  );
}
