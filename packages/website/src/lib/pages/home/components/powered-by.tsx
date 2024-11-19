import React from 'react';
import Image from 'next/image';

export const PoweredBy = () => {
  return (
    <div className="w-full my-12 px-4 md:px-14">
      <div className="border border-border rounded-4xl p-14 text-center">
          <div className="inline-block mx-auto border border-border rounded-4xl px-8 py-2.5">
            <h2 className="font-semibold text-lg">Powered By</h2>
          </div>
          <div className="grid w-full">
          <div className="flex flex-col md:flex-row items-center justify-center md:space-x-20">
            <div className="flex items-center justify-center">
              <Image
                src="/assets/ethereum.png"
                alt="Ethereum"
                width={250}
                height={150}
              />
            </div>
            <div className="flex items-center justify-center">
              <Image
                src="/assets/uniswap.png"
                alt="Uniswap"
                width={250}
                height={150}
                className="h-full w-auto"
              />
            </div>
            <div className="flex items-center justify-center">
              <Image
                src="/assets/uma.png"
                alt="UMA"
                width={250}
                height={150}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
