import EmailCaptureButton from '@/lib/components/EmailCaptureButton';

export const Features = () => {
  return (
    <div className="w-full px-4 md:px-14 text-center z-10">
      <div className="grid grid-cols-1 gap-6 md:gap-14 md:pt-12 lg:grid-cols-3 md:-mt-40">
        <div className="rounded-4xl border border-border p-6 bg-white">
          <h2 className="mb-2 text-3xl font-semibold text-primary">
            Subscribe
          </h2>
          <div className="mb-5 text-xl leading-relaxed text-muted-foreground">
            Estimate usage and hedge transaction costs.
          </div>
          <EmailCaptureButton>Subscribe</EmailCaptureButton>
        </div>
        <div className="rounded-4xl border border-border p-6 bg-white">
          <h2 className="mb-2 text-3xl font-semibold text-primary">Trade</h2>
          <div className="mb-5 text-xl leading-relaxed text-muted-foreground">
            Buy and sell exposure to gas and blob prices.
          </div>
          <EmailCaptureButton>Trade</EmailCaptureButton>
        </div>
        <div className="rounded-4xl border border-border p-6 bg-white">
          <h2 className="mb-2 text-3xl font-semibold text-primary">Earn</h2>
          <div className="mb-5 text-xl leading-relaxed text-muted-foreground">
            Provide liquidity and boost LST yield.
          </div>
          <EmailCaptureButton>Earn</EmailCaptureButton>
        </div>
      </div>
    </div>
  );
};
