export const HowItWorks = () => {
  return (
    <div className="w-full border-b border-t border-border bg-secondary px-4 md:px-6">
      <div className="container mx-auto max-w-6xl py-16 text-center md:pb-32 md:pt-24">
        <div className="mx-auto mb-14 inline-block rounded-4xl border border-border bg-white px-8 py-2.5">
          <h2 className="text-lg font-semibold">How It Works</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:gap-16 lg:grid-cols-3">
          <div className="flex items-center justify-center rounded-lg border border-border bg-background p-6 shadow-sm">
            <div className="text-xl leading-relaxed text-muted-foreground">
              Liquidity providers can earn yield on their liquid staking tokens.
            </div>
          </div>
          <div className="flex items-center justify-center rounded-lg border border-border bg-background p-6 shadow-sm">
            <div className="text-xl leading-relaxed text-muted-foreground">
              Gas and blobspace buyers purchase Foil subscriptions where profits
              are realized when average costs increase.
            </div>
          </div>
          <div className="flex items-center justify-center rounded-lg border border-border bg-background p-6 shadow-sm">
            <div className="text-xl leading-relaxed text-muted-foreground">
              Paymasters and roll-ups are able to offer fixed-cost arrangements
              to users.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
