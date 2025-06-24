import { Button } from '@sapience/ui/components/ui/button';
import { Rocket } from 'lucide-react';

export default function BotsQuickStart() {
  return (
    <section className="pt-12 pb-24 lg:pt-24 lg:pb-48 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col-reverse lg:flex-row gap-8 lg:gap-28 lg:items-center lg:justify-center">
          {/* Left side: Explanatory text and CTA */}
          <div className="w-full lg:w-3/5 lg:max-w-[320px] text-left lg:text-inherit">
            <h2 className="font-sans text-2xl lg:text-3xl font-normal mb-2 lg:mb-6">
              Deploy Today
            </h2>
            <p className="text-muted-foreground text-lg mb-6">
              Use the quick start template to deploy a bot{' '}
              <a
                href="https://x.com/0xbeadbot"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                like this one
              </a>{' '}
              in under an hour.
            </p>
            <div className="pt-2">
              <a
                href="https://docs.sapience.xyz/quick-start"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button>
                  <Rocket className="h-4 w-4 mr-1" />
                  Quick Start
                </Button>
              </a>
            </div>
          </div>

          {/* Right side: Video Embed */}
          <div className="w-full lg:w-2/5">
            <div
              style={{
                position: 'relative',
                width: '100%',
                paddingBottom: '75%' /* 4:3 Aspect Ratio */,
                borderRadius: '0.5rem',
                overflow: 'hidden',
              }}
            >
              <iframe
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                }}
                src="https://www.youtube.com/embed/r0udy9AUF_Y?rel=0&modestbranding=1&showinfo=0"
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
