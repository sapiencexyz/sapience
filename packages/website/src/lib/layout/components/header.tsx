import EmailCaptureButton from '@/lib/components/EmailCaptureButton';
import Image from 'next/image';

export const Header = () => {
  return (
    <header className="bg-base-100/80 position-fixed sticky top-0 z-10 w-full border-b border-border bg-background md:bg-transparent md:backdrop-blur-md">
      <div className="bg-black p-2 text-center text-background">
        <span className="font-semibold">
          ⛽ Foil&apos;s Testnet Competition is coming soon.
        </span>
      </div>
      <section className="flex items-center justify-between p-2">
        <Image src="/assets/logo.svg" alt="Logo" width={100} height={100} />
        <div className="ml-auto flex items-center gap-8">
          <a
            href="https://docs.foil.xyz"
            className="text-foreground decoration-1 underline-offset-2 hover:underline"
          >
            Docs
          </a>
          <EmailCaptureButton>Go to App</EmailCaptureButton>
        </div>
      </section>
    </header>
  );
};
