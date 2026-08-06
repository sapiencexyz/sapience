'use client';

const Footer = () => {
  return (
    <footer className="fixed bottom-0 left-0 block w-full z-[40]">
      <a
        href="https://meridian.xyz"
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center bg-[rgb(103,201,243)] py-1.5 font-mono text-sm font-medium uppercase tracking-wider text-brand-black transition-colors hover:bg-[rgb(103,201,243)]/90"
      >
        Trade on Meridian
      </a>
    </footer>
  );
};

export default Footer;
