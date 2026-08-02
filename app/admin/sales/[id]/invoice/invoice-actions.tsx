"use client";

import { Button } from "../../../_components/ui";
import { WhatsAppShareButton } from "../../../_components/whatsapp-share-button";

/**
 * Download + Share:
 * - Download triggers the browser print dialog (window.print()); the shop
 *   owner saves as PDF from there. No canvas/vector PDF library is used, per
 *   the invoice-generation skill.
 * - Share is the shared WhatsAppShareButton: asks which number to send to
 *   (prefilled from the customer's saved phone if there is one, but always
 *   editable), then opens wa.me/<number> with the full itemized bill +
 *   payment breakdown prefilled — just press Send.
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
  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          Download
        </Button>
        <WhatsAppShareButton
          defaultPhone={defaultPhone}
          message={shareText}
          label="Share"
          prompt={`WhatsApp number likhein jis ko ${invoiceNumber} bhejni hai. OK karte hi WhatsApp us ki chat khol dega, bill already likha hoga — bas Send dabayein.`}
        />
      </div>
    </div>
  );
}
