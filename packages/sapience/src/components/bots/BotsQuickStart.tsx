import { Button } from '@sapience/ui/components/ui/button';
import Image from 'next/image';

export default function ElizaHomepageFeature() {
  return (
    <div>
      {/* ElizaOS Section */}
      <section className="pt-16 lg:pt-24 pb-8 lg:pb-12 px-4 sm:px-6 w-full">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col-reverse lg:flex-row gap-8 lg:gap-28 lg:items-center lg:justify-center">
            {/* Left side: Explanatory text and CTAs */}
            <div className="w-full lg:w-3/5 lg:max-w-[370px] text-left lg:text-inherit">
              <div className="mb-6">
                <Image
                  src="/elizaos-logo.svg"
                  alt="Eliza OS"
                  width={400}
                  height={120}
                  className="w-auto h-auto max-w-[200px] dark:invert"
                />
              </div>
              <p className="text-muted-foreground text-lg mb-6">
                Build AI agents that forecast the future and participate in
                prediction markets using the ElizaOS plug-in.
              </p>
              <div className="pt-2 gap-2 flex flex-wrap justify-start">
                <a
                  href="https://eliza.how/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-auto">
                    <Image
                      src="/eliza-icon.png"
                      alt="Eliza"
                      width={16}
                      height={16}
                      className="rounded-sm"
                    />
                    Get Started
                  </Button>
                </a>
                <a
                  href="https://github.com/sapiencexyz/sage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 sm:ml-5"
                >
                  <Button variant="outline" className="w-auto">
                    <Image
                      src="/github.svg"
                      alt="GitHub"
                      width={16}
                      height={16}
                      className="invert dark:invert-0"
                    />
                    Agent Boilerplate
                  </Button>
                </a>
              </div>
            </div>

            {/* Right side: Video background with centered hero image */}
            <div className="w-full lg:w-2/5 mb-6 lg:mb-0">
              <div
                className="relative w-full rounded-lg overflow-hidden flex items-end justify-center inner-shadow"
                style={{ paddingBottom: '60%' /* Taller aspect ratio */ }}
              >
                {/* Background video */}
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src="/eliza-bg.mp4" type="video/mp4" />
                </video>

                {/* Hero image shifted down */}
                <div className="absolute z-10 w-[80%] bottom-[-50%]">
                  <img
                    src="/eliza-hero.png"
                    alt="Eliza Hero"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
