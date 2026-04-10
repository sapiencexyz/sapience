'use client';

export default function Ecosystem() {
  return (
    <section className="w-full py-16 md:py-20">
      <div className="container mx-auto lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[1440px] px-4 md:px-8">
        <h2 className="eyebrow text-foreground mb-6">Ecosystem</h2>
        <div className="relative flex flex-col md:flex-row items-start text-foreground gap-6 md:gap-8">
          <div className="w-full md:basis-1/3 flex items-center justify-start gap-3 md:gap-4 md:pr-2">
            <img
              src="/ethena-circle.svg"
              alt="Ethena"
              className="h-16 w-16 md:h-24 md:w-24"
            />
            <p className="text-sm md:text-base leading-relaxed text-foreground/80">
              <a
                href="https://ethena.fi"
                target="_blank"
                rel="noreferrer"
                className="gold-link"
              >
                Ethena
              </a>
              's USDe is a reward-bearing synthetic dollar used as collateral in
              Sapience's prediction markets.
            </p>
          </div>
          <div className="w-full md:basis-1/3 flex items-center justify-start gap-3 md:gap-4 pl-1 pr-0 md:pl-3 md:pr-3">
            <img
              src="/openclaw-circle.svg"
              alt="OpenClaw"
              className="h-16 w-16 md:h-24 md:w-24"
            />
            <p className="text-sm md:text-base leading-relaxed text-foreground/80">
              Give your agent (
              <a
                href="https://github.com/openclaw/openclaw"
                target="_blank"
                rel="noreferrer"
                className="gold-link"
              >
                OpenClaw
              </a>
              , Claude Code, and more) skills to forecast, trade, and market
              make.
            </p>
          </div>
          <div className="w-full md:basis-1/3 relative flex items-center justify-start gap-3 md:gap-4 md:pl-1">
            <img
              src="/arbitrum-circle.svg"
              alt="Arbitrum"
              className="h-16 w-16 md:h-24 md:w-24 shrink-0"
            />
            <p className="text-sm md:text-base leading-relaxed text-foreground/80">
              Prediction market positions are ERC&#8209;20 standard{' '}
              <a
                href="https://tokenlists.org/token-list?url=https://api.sapience.xyz/tokenlist.json"
                target="_blank"
                rel="noreferrer"
                className="gold-link"
              >
                tokens on Arbitrum
              </a>
              . Integrate with DeFi protocols and trade freely.
            </p>
          </div>
          <span
            aria-hidden
            className="hidden md:flex pointer-events-none absolute left-[33.333%] top-1/2 -translate-y-1/2 items-center"
          >
            <span className="block h-20 md:h-24 gold-hr-vertical" />
          </span>
          <span
            aria-hidden
            className="hidden md:flex pointer-events-none absolute left-[66.666%] top-1/2 -translate-y-1/2 items-center"
          >
            <span className="block h-20 md:h-24 gold-hr-vertical" />
          </span>
        </div>
      </div>
    </section>
  );
}
