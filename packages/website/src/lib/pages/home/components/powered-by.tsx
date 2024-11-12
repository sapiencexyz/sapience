import React from 'react';
import Image from 'next/image';

export const PoweredBy = () => {
  return (
    <div className="container mx-auto w-full max-w-3xl px-4 pb-24 pt-5 md:px-6">
      <div className="grid text-center">
        <h1 className="mb-6 text-sm font-medium uppercase tracking-widest text-gray-500">
          Powered By
        </h1>
        <div className="mx-auto grid max-w-48 grid-cols-1 items-center gap-4 md:max-w-none md:grid-cols-3">
          <div className="flex items-center justify-center">
            <Image
              src="/assets/ethereum.svg"
              alt="Ethereum"
              width={0}
              height={0}
              className="h-full w-auto object-contain grayscale filter"
            />
          </div>
          <div className="-mt-1 flex items-center justify-center">
            <Image
              src="/assets/uniswap.svg"
              alt="Uniswap"
              width={0}
              height={0}
              className="h-full w-auto object-contain grayscale filter"
            />
          </div>
          <div className="mt-4 flex h-8 items-center justify-center md:mt-0">
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
