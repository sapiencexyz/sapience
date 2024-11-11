import { Button } from '@/components/ui/button';
import Image from 'next/image';
export const Header = () => {
  return (
    <header className="bg-base-100/80 position-fixed sticky top-0 z-10 w-full border-b border-border bg-background md:bg-transparent md:backdrop-blur-md">
      <section className="flex items-center justify-between p-2">
        <Image src="/assets/logo.svg" alt="Logo" width={100} height={100} />
        <div className="ml-auto flex items-center gap-8">
          <a
            href="https://docs.foil.xyz"
            className="text-foreground hover:underline"
          >
            Docs
          </a>
          <Button>Go to App</Button>
        </div>
      </section>
    </header>
  );
};
