'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { SiDiscord, SiX } from 'react-icons/si';

interface GetAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GetAccessDialog = ({ open, onOpenChange }: GetAccessDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] top-1/2 translate-y-[-50%]">
        <DialogHeader>
          <DialogTitle className="text-xl font-normal">
            Get Early Access to Sapience
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-base">
          <p className="text-brand-white">
            To get started, you&apos;ll need an invite code from an existing
            member. Request an invite code in our Discord or DM us on X.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
            <a
              href="https://discord.gg/sapience"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <SiDiscord className="h-4 w-4" />
              Join Discord
            </a>
            <a
              href="https://x.com/sapiencemarkets"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <SiX className="h-3.5 w-3.5" />
              DM @sapiencemarkets
            </a>
          </div>
          <p className="text-sm text-muted-foreground !mt-2">
            Once you have a code, click <em>Log in</em>, connect your wallet,
            and enter it.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GetAccessDialog;
