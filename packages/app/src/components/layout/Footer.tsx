'use client';

import { Button } from '@sapience/ui/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { SiSubstack } from 'react-icons/si';
import { StatusIndicators } from '~/components/layout/StatusIndicators';

export { ETHENA_BASE_APY } from '~/components/layout/StatusIndicators';

const Footer = () => {
  return (
    <footer className="mt-auto block w-full border-t border-border/20 sm:border-border/40 bg-background/60 backdrop-blur-sm relative z-[40] sm:fixed sm:bottom-0 sm:left-0">
      <div className="mx-auto px-4 sm:px-3 pt-3 pb-2 sm:py-2 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
        <StatusIndicators />

        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3.5">
          <div className="flex items-center gap-3 text-xs order-2 sm:order-1">
            <Link
              href="https://docs.sapience.xyz/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center font-normal text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              href="https://docs.sapience.xyz/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center font-normal text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
          <div className="flex items-center gap-2 order-1 sm:order-2">
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://github.com/sapiencexyz/sapience"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/github.svg"
                  alt="GitHub"
                  width={10}
                  height={10}
                />
              </a>
            </Button>
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://x.com/sapiencemarkets"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/x.svg"
                  alt="Twitter"
                  width={10}
                  height={10}
                />
              </a>
            </Button>
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://discord.gg/sapience"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Image
                  className="dark:invert"
                  src="/discord.svg"
                  alt="Discord"
                  width={10}
                  height={10}
                />
              </a>
            </Button>
            <Button size="icon" className="h-4 w-4 rounded-full" asChild>
              <a
                href="https://blog.sapience.xyz"
                target="_blank"
                rel="noopener noreferrer"
              >
                <SiSubstack
                  className="h-0.5 w-0.5 scale-[60%]"
                  aria-label="Substack"
                />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
