'use client';

import { Share, PlusSquare } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';

const LOCAL_STORAGE_KEY = 'sapiencePwaInstallDismissed';
const DISMISSAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const InstallDialog = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [canShow, setCanShow] = useState(false);

  const shouldOpenInstallDialog = () => {
    const query =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
    const forceShow = query?.get('showInstall') === '1';

    const isIpadOs13Plus =
      typeof navigator !== 'undefined' &&
      /Macintosh/.test(navigator.userAgent) &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;

    const isMobile = (() => {
      try {
        const navAny = navigator as unknown as {
          userAgentData?: { mobile?: boolean };
        };
        if (
          navAny?.userAgentData &&
          typeof navAny.userAgentData.mobile === 'boolean'
        ) {
          return !!navAny.userAgentData.mobile;
        }
      } catch {
        // ignore
      }
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      return /iPhone|iPad|iPod|Android/i.test(ua) || isIpadOs13Plus;
    })();

    const isStandalone =
      typeof window !== 'undefined'
        ? window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true
        : false;

    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LOCAL_STORAGE_KEY)
        : null;

    let lastDismissedAt: number | null = null;
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed > 0) {
        lastDismissedAt = parsed;
      }
    }

    if (forceShow) return true;

    if (isMobile && !isStandalone) {
      // On the very first eligible encounter, behave as if the user
      // immediately dismissed the dialog: record a dismissal timestamp
      // and do NOT show the dialog. It will only appear on the next
      // cycle once the configured window has elapsed.
      if (lastDismissedAt == null) {
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(LOCAL_STORAGE_KEY, String(Date.now()));
          }
        } catch {
          // ignore
        }
        return false;
      }

      if (Date.now() - lastDismissedAt >= DISMISSAL_WINDOW_MS) return true;
    }

    return false;
  };

  useEffect(() => {
    try {
      setCanShow(true);
      if (shouldOpenInstallDialog()) setIsOpen(true);
    } catch {
      // no-op
    }
  }, []);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, String(Date.now()));
      } catch {
        // no-op
      }
    }
  };

  if (!canShow) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90%] sm:max-w-[425px] mx-auto top-1/2 translate-y-[-50%]">
        <div className="mx-auto w-full max-w-sm">
          <DialogHeader className="my-4">
            <DialogTitle className="text-center text-2xl font-normal">
              Install Sapience
            </DialogTitle>
            <DialogDescription className="max-w-[220px] mx-auto">
              It's way better like this and just takes a second. Trust us.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded bg-brand-black text-brand-white font-mono text-xs p-5 text-center mb-2">
            <div className="space-y-2">
              <p>
                Tap the{' '}
                <span className="mx-0.5 inline-flex translate-y-[3px] items-center">
                  <Share className="h-4 w-4 text-accent-gold" />
                </span>{' '}
                icon in your browser
              </p>
            </div>
            <div className="space-y-2">
              <p>
                Select{' '}
                <span className="mx-0.5 inline-flex translate-y-[3px] items-center">
                  <PlusSquare className="h-4 w-4 text-accent-gold" />
                </span>{' '}
                Add to Home Screen
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InstallDialog;
