"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Surfaces a visible "Install app" control in the sidebar so the admin can
 * add this as a real app icon on their phone or laptop, instead of relying
 * on the browser's own (easy-to-miss) install affordance. Chrome/Edge/
 * Android fire `beforeinstallprompt`, which we capture and replay on click.
 * iOS Safari never fires that event, so it gets a short manual-steps hint
 * instead — there is no programmatic install trigger on iOS.
 */
export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    );
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (isStandalone) return null;
  if (!installEvent && !isIOS) return null;

  async function handleClick() {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "accepted") setInstallEvent(null);
      return;
    }
    setShowIOSHint((v) => !v);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M10 2a1 1 0 011 1v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3a1 1 0 011-1zM4 15a1 1 0 011 1v1h10v-1a1 1 0 112 0v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1a1 1 0 011-1z" />
        </svg>
        Install app
      </button>
      {showIOSHint ? (
        <p className="mt-2 text-center text-[11px] leading-snug text-white/60">
          Share button dabayen, phir &ldquo;Add to Home Screen&rdquo; chunein.
        </p>
      ) : null}
    </div>
  );
}
