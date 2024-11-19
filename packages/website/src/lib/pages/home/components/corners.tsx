export const Corners = () => {
  return (
    <>
      <svg className="fixed z-40 top-0 left-0 w-9 h-9" viewBox="0 0 36 36">
        <path
          d="M0 0C0 19.882 16.118 36 36 36H0V0Z"
          transform="rotate(90 18 18)"
          fill="black"
        />
      </svg>

      <svg className="fixed z-40 top-0 right-0 w-9 h-9" viewBox="0 0 36 36">
        <path
          d="M0 0C0 19.882 16.118 36 36 36H0V0Z"
          transform="rotate(180 18 18)"
          fill="black"
        />
      </svg>

      <svg className="fixed z-40 bottom-0 left-0 w-9 h-9" viewBox="0 0 36 36">
        <path
          d="M0 0C0 19.882 16.118 36 36 36H0V0Z"
          fill="black"
        />
      </svg>

      <svg className="fixed z-40 bottom-0 right-0 w-9 h-9" viewBox="0 0 36 36">
        <path
          d="M0 0C0 19.882 16.118 36 36 36H0V0Z"
          transform="rotate(270 18 18)"
          fill="black"
        />
      </svg>
    </>
  );
};
