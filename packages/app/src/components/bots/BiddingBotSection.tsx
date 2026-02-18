'use client';

export default function BiddingBotSection() {
  return (
    <section className="pt-10 lg:pt-20 pb-12 lg:pb-28 xl:pb-36 px-4 sm:px-6 w-full">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col-reverse lg:flex-row-reverse gap-8 lg:gap-16 lg:items-center">
          {/* Right: Copy */}
          <div className="w-full lg:w-3/5 lg:max-w-[640px] text-left">
            <div className="space-y-3 mb-2">
              <div className="eyebrow text-foreground">
                PREDICTION MARKET MAKING AGENT
              </div>
              <p className="headline text-lg md:text-xl lg:text-2xl">
                Build an agent that listens for{' '}
                <a href="/markets" className="gold-link">
                  prediction market
                </a>{' '}
                traders. Have it bid in{' '}
                <a href="/feed#auctions" className="gold-link">
                  auctions
                </a>{' '}
                with the best odds it can offer while managing risk.
              </p>
              <p className="headline text-lg md:text-xl lg:text-2xl">
                Check out{' '}
                <a
                  href="https://docs.sapience.xyz/builder-guide/guides/market-making-agent"
                  className="gold-link"
                >
                  the docs
                </a>
                , fork the boilerplate, and start building.{' '}
                <em>What's your edge?</em>
              </p>
            </div>
          </div>

          {/* Left: Visual */}
          <div className="w-full lg:w-2/5 max-w-[560px] mx-auto">
            <div
              className="relative w-full rounded-lg overflow-hidden flex items-end justify-center inner-shadow"
              style={{ paddingBottom: '56%' }}
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              >
                <source src="/mm_bot.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
