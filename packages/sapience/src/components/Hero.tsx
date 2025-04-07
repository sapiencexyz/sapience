'use client';

export default function Hero() {
  return (
    <div className="relative h-[100dvh] overflow-hidden w-full flex flex-col justify-end">
      {/* Spline embed background - made larger than viewport */}
      <div
        className="absolute inset-0 z-0"
        style={{
          opacity: 0.5,
          transform: 'translate(50%, -50%) scale(3)',
          transformOrigin: 'center center',
        }}
      >
        <iframe
          title="art"
          src="https://my.spline.design/particles-672e935f9191bddedd3ff0105af8f117/"
          style={{ width: '100%', height: '100%', border: 'none' }}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        />
      </div>

      {/* Content container - positioned at bottom, left-aligned */}
      <div className="w-full z-10">
        <div className="container px-0 pb-0">
          <div className="text-left px-8 py-16">
            <h1 className="font-sans text-3xl md:text-5xl font-normal mb-4">
              The World&apos;s Frontier
              <br />
              Prediction Community
            </h1>

            <p className="text-xl md:text-2xl mb-6 text-muted-foreground">
              Join experts and enthusiasts forecasting the future of AI,
              <br />
              Biosecurity, Climate Change, International Relations, and more.
            </p>

            <div className="flex justify-start">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault(); // Prevent default link behavior
                  window.scrollTo({
                    top: window.innerHeight, // Scroll down by viewport height
                    behavior: 'smooth',
                  });
                }}
                className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold bg-transparent border-none p-0"
              >
                LEARN MORE
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-0.5"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
