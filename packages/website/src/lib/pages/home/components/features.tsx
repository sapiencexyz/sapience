import EmailCaptureButton from '@/lib/components/EmailCaptureButton';

export const Features = () => {
  return (
    <div className="z-10 w-full px-4 pt-6 text-center md:px-14 md:pt-0">
      <div className="grid grid-cols-1 gap-6 md:-mt-40 md:gap-14 md:pt-12 lg:grid-cols-3">
        <div className="rounded-4xl border border-border bg-white p-14">
          <h2 className="mb-4 text-3xl font-bold text-primary">Subscribe</h2>
          <div className="mx-auto mb-7 max-w-56 text-xl">
            Estimate usage and hedge transaction costs.
          </div>
          <EmailCaptureButton>Subscribe</EmailCaptureButton>
        </div>
        <div className="rounded-4xl border border-border bg-white p-14">
          <h2 className="mb-4 text-3xl font-bold text-primary">Trade</h2>
          <div className="mx-auto mb-7 max-w-56 text-xl">
            Buy and sell exposure to gas and blob prices.
          </div>
          <EmailCaptureButton>Trade</EmailCaptureButton>
        </div>
        <div className="rounded-4xl border border-border bg-white p-14">
          <h2 className="mb-4 text-3xl font-bold text-primary">Earn</h2>
          <div className="mx-auto mb-7 max-w-56 text-xl">
            Provide liquidity and boost LST yield.
          </div>
          <EmailCaptureButton>Earn</EmailCaptureButton>
        </div>
      </div>
    </div>
  );
};
