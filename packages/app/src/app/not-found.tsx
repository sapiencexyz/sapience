import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 Not Found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col justify-center">
      <div className="mx-auto w-full">
        <h1 className="mb-3 text-center text-2xl font-bold">404</h1>
        <h2 className="text-center text-xl font-bold">🖕</h2>
      </div>
    </div>
  );
}
