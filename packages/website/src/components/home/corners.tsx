export const Corners = () => {
  return (
    <>
      <div className="pointer-events-none fixed left-0 top-0 z-[9999] h-full w-full border-[10px] border-[#2C2C2E]" />
      <svg
        className="fixed left-[10px] top-[10px] z-40 h-9 w-9"
        viewBox="0 0 36 36"
      >
        <path
          d="M0 0C0 19.882 16.118 36 36 36H0V0Z"
          transform="rotate(90 18 18)"
          fill="#2C2C2E"
        />
      </svg>

      <svg
        className="fixed right-[10px] top-[10px] z-40 h-9 w-9"
        viewBox="0 0 36 36"
      >
        <path
          d="M0 0C0 19.882 16.118 36 36 36H0V0Z"
          transform="rotate(180 18 18)"
          fill="#2C2C2E"
        />
      </svg>

      <svg
        className="fixed bottom-[10px] left-[10px] z-40 h-9 w-9"
        viewBox="0 0 36 36"
      >
        <path d="M0 0C0 19.882 16.118 36 36 36H0V0Z" fill="#2C2C2E" />
      </svg>

      <svg
        className="fixed bottom-[10px] right-[10px] z-40 h-9 w-9"
        viewBox="0 0 36 36"
      >
        <path
          d="M0 0C0 19.882 16.118 36 36 36H0V0Z"
          transform="rotate(270 18 18)"
          fill="#2C2C2E"
        />
      </svg>
    </>
  );
};
