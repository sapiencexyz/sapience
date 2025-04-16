'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@foil/ui/components/ui/dialog';
import { Share, PlusSquare } from 'lucide-react';
import Image from 'next/image';

interface InstallDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const InstallDialog = ({ isOpen, onOpenChange }: InstallDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] mx-auto" autoFocus={false}>
        <div className="mx-auto w-full max-w-sm">
          <DialogHeader className="mb-6">
            <div className="my-4 flex justify-center">
              <Image
                src="/icons/icon-192x192.png"
                alt="Sapience App Icon"
                width={72}
                height={72}
                className="rounded-2xl border border-border shadow-lg"
              />
            </div>
            <DialogTitle className="text-center text-2xl">
              Install Sapience
            </DialogTitle>
            <DialogDescription className="max-w-[260px] mx-auto">
              Add the app to your home screen for{' '}
              <strong>one tap to forecasting</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 rounded-lg bg-muted px-4 py-6 text-center">
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
