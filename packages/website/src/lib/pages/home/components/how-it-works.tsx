export const HowItWorks = () => {
  return (
    <div className="grid gap-2.5">
      <h1 className="bg-gradient-to-br from-gray-200 to-teal-700 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
        How It Works
      </h1>
      <div className="grid grid-cols-3 gap-2.5">
        <div>
          Liquidity providers can earn yield on their liquid staking tokens.
        </div>
        <div>
          Gas and blobspace buyers purchase Foil subscriptions where profits are
          realized when average costs increase.
        </div>
        <div>
          Paymasters and roll-ups are able to offer fixed-cost arrangements to
          users
        </div>
      </div>
    </div>
  );
};
