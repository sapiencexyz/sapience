'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import Image from 'next/image';
import { Copy, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@sapience/ui/hooks/use-toast';
import LottieLoader from '~/components/shared/LottieLoader';

interface OgShareDialogBaseProps {
  imageSrc: string; // Relative path with query, e.g. "/og/trade?..."
  title?: string; // Dialog title
  trigger?: React.ReactNode;
  shareTitle?: string; // Title for navigator.share
  shareText?: string; // Text for navigator.share
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  loaderSizePx?: number; // defaults to 48 for consistency
  copyButtonText?: string; // defaults to "Copy Image"
  shareButtonText?: string; // defaults to "Share"
}

export default function OgShareDialogBase(props: OgShareDialogBaseProps) {
  const {
    imageSrc,
    title = 'Share',
    trigger,
    shareTitle = 'Share',
    shareText,
    open: controlledOpen,
    onOpenChange,
    loaderSizePx = 48,
    copyButtonText = 'Copy Image',
    shareButtonText = 'Share',
  } = props;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = typeof controlledOpen === 'boolean';
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled
    ? (val: boolean) => onOpenChange && onOpenChange(val)
    : setUncontrolledOpen;

  const [cacheBust, setCacheBust] = useState('');
  const [imgLoading, setImgLoading] = useState(true);
  const { toast } = useToast();

  const buildXShareUrl = (
    url: string,
    opts?: { text?: string; via?: string; hashtags?: string[] }
  ) => {
    try {
      const u = new URL('https://twitter.com/intent/tweet');
      u.searchParams.set('url', url);
      if (opts?.text) u.searchParams.set('text', opts.text);
      if (opts?.via) u.searchParams.set('via', opts.via);
      if (opts?.hashtags?.length)
        u.searchParams.set('hashtags', opts.hashtags.join(','));
      return u.toString();
    } catch {
      return `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`;
    }
  };

  // Absolute URL to the actual image route (for copying image binary)
  const absoluteImageUrl = useMemo(() => {
    if (typeof window !== 'undefined')
      return `${window.location.origin}${imageSrc}`;
    return imageSrc;
  }, [imageSrc]);

  // Canonical share page base; encoded short path becomes /s/<token>
  const shareHref = useMemo(() => `/share`, []);

  useEffect(() => {
    if (open) setCacheBust(String(Date.now()));
  }, [open]);

  const previewSrc = `${imageSrc}${cacheBust ? `&cb=${cacheBust}` : ''}`;

  useEffect(() => {
    setImgLoading(true);
  }, [previewSrc]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            {title}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader className="pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="w-full aspect-[1200/630] bg-muted rounded overflow-hidden relative border border-border">
            {imgLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LottieLoader width={loaderSizePx} height={loaderSizePx} />
              </div>
            )}
            <Image
              src={previewSrc}
              alt="Share preview"
              fill
              sizes="(max-width: 768px) 100vw, 720px"
              onLoad={() => setImgLoading(false)}
              onError={() => setImgLoading(false)}
              priority
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {/* Copy */}
            <Button
              size="lg"
              className="w-full"
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  const res = await fetch(absoluteImageUrl, {
                    cache: 'no-store',
                  });
                  const blob = await res.blob();
                  if (navigator.clipboard && (window as any).ClipboardItem) {
                    const item = new (window as any).ClipboardItem({
                      [blob.type]: blob,
                    });
                    await navigator.clipboard.write([item]);
                    toast({ title: 'Image copied successfully' });
                    return;
                  }

                  // Fallback: generate compact share URL and copy as text
                  const payload = {
                    img: imageSrc,
                    title: shareTitle,
                    description: shareText,
                    alt: 'Sapience share image',
                  };
                  let shareUrl = shareHref;
                  try {
                    const resp = await fetch('/api/share/encode', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    const data = await resp.json();
                    shareUrl = data?.shareUrl || shareHref;
                  } catch {
                    // ignore and use fallback
                  }
                  await navigator.clipboard.writeText(shareUrl);
                  toast({ title: 'Link copied successfully' });
                } catch {
                  try {
                    const payload = {
                      img: imageSrc,
                      title: shareTitle,
                      description: shareText,
                      alt: 'Sapience share image',
                    };
                    let shareUrl = shareHref;
                    try {
                      const resp = await fetch('/api/share/encode', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      const data = await resp.json();
                      shareUrl = data?.shareUrl || shareHref;
                    } catch {
                      // ignore and use fallback
                    }
                    await navigator.clipboard.writeText(shareUrl);
                    toast({ title: 'Link copied successfully' });
                  } catch {
                    // ignore
                  }
                }
              }}
            >
              <Copy className="mr-0.5 h-4 w-4" /> {copyButtonText}
            </Button>
            {/* Post (X) - middle */}
            <Button
              size="lg"
              className="w-full"
              type="button"
              onClick={async () => {
                // Request compact share URL from API
                const payload = {
                  // send relative path to shorten token further
                  img: imageSrc,
                  title: shareTitle,
                  description: shareText,
                  alt: 'Sapience share image',
                };
                try {
                  const res = await fetch('/api/share/encode', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  const shareUrl = data?.shareUrl || shareHref;
                  const intent = buildXShareUrl(shareUrl);
                  window.open(intent, '_blank', 'noopener,noreferrer');
                } catch {
                  const intent = buildXShareUrl(shareHref);
                  window.open(intent, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <Image
                src="/x.svg"
                alt="X"
                width={14}
                height={14}
                className="mr-0.5 dark:invert"
              />
              Post
            </Button>
            {/* Share */}
            <Button
              size="lg"
              className="w-full"
              type="button"
              variant="outline"
              onClick={async () => {
                const payload = {
                  img: imageSrc,
                  title: shareTitle,
                  description: shareText,
                  alt: 'Sapience share image',
                };
                let shareUrl = shareHref;
                try {
                  const res = await fetch('/api/share/encode', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  shareUrl = data?.shareUrl || shareHref;
                } catch {
                  // ignore; use fallback
                }
                if ((navigator as any).share) {
                  try {
                    await (navigator as any).share({ url: shareUrl });
                    return;
                  } catch {
                    // fallthrough
                  }
                }
                window.open(shareUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <Share2 className="mr-0.5 h-4 w-4" /> {shareButtonText}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
