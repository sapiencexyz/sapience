export const HowItWorks = () => {
  return (
    <div className="w-full border-b border-t border-border bg-secondary px-4 md:px-6">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-6 py-8 text-center md:gap-12 md:py-24 lg:grid-cols-3">
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
