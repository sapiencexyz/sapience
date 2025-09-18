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
import LottieLoader from './LottieLoader';

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
      if (lastDismissedAt == null) return true;
      if (Date.now() - lastDismissedAt >= DISMISSAL_WINDOW_MS) return true;
    }
    return false;
  };

  useEffect(() => {
    try {
      // Gate the install dialog behind the scrim auth
      const authed =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('isAuthenticated') === 'true'
          : false;

      if (!authed) {
        setCanShow(false);
        setIsOpen(false);
        const onAuthed = () => {
          try {
            // Re-run logic once authenticated
            setCanShow(true);
            if (shouldOpenInstallDialog()) setIsOpen(true);
          } catch {
            // ignore
          }
        };
        if (typeof window !== 'undefined') {
          window.addEventListener('sapience-authenticated', onAuthed, {
            once: true,
          } as AddEventListenerOptions);
        }
        return () => {
          if (typeof window !== 'undefined') {
            window.removeEventListener(
              'sapience-authenticated',
              onAuthed as EventListener
            );
          }
        };
      }

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
      <DialogContent className="max-w-[90%] sm:max-w-[425px] mx-auto">
        <div className="mx-auto w-full max-w-sm">
          <DialogHeader className="mb-6">
            <div className="flex justify-center mt-6 mb-1 opacity-80">
              <LottieLoader width={48} height={48} />
            </div>
            <DialogTitle className="text-center text-xl font-medium">
              Install Sapience
            </DialogTitle>
            <DialogDescription className="max-w-[200px] mx-auto">
              It's way better this way and just takes a second. Trust us.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 rounded-lg bg-muted p-4 text-center mb-3">
            <div className="space-y-2">
              <p>
                Tap the{' '}
                <span className="mx-0.5 inline-flex translate-y-[3px] items-center">
                  <Share className="h-5 w-5" />
                </span>{' '}
                icon in your browser
              </p>
            </div>
            <div className="space-y-2">
              <p>
                Select{' '}
                <span className="mx-0.5 inline-flex translate-y-[3px] items-center">
                  <PlusSquare className="h-5 w-5" />
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
