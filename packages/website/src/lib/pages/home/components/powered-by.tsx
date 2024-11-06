import React from 'react';
import Image from 'next/image';

export const PoweredBy = () => {
  return (
    <div className="container mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
      <div className="grid gap-4 text-center">
        <h1 className="text-2xl font-semibold text-primary">Powered By</h1>
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-3">
          <div className="flex h-28 items-center justify-center p-4">
            <Image
              src="/assets/ethereum.svg"
              alt="Ethereum"
              width={0}
              height={0}
              className="h-full w-auto object-contain grayscale filter"
            />
          </div>
          <div className="flex h-24 items-center justify-center p-4">
            <Image
              src="/assets/uniswap.svg"
              alt="Uniswap"
              width={0}
              height={0}
              className="h-full w-auto object-contain grayscale filter"
            />
          </div>
          <div className="flex h-16 items-center justify-center p-4">
            <Image
              src="/assets/uma.svg"
              alt="UMA"
              width={0}
              height={0}
              className="h-full w-auto object-contain grayscale filter"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
