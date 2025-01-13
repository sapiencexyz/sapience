import React from "react";
import Image from "next/image";

export const PoweredBy = () => {
  return (
    <div className="my-12 w-full px-4 md:px-14">
      <div className="rounded-4xl border border-border pb-8 pt-16 text-center">
        <div className="mx-auto inline-block rounded-4xl border border-border px-8 py-2.5">
          <h2 className="text-lg font-semibold">Powered By</h2>
        </div>
        <div className="grid w-full">
          <div className="flex flex-col items-center justify-center md:flex-row md:space-x-20">
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
              />
            </div>
            <div className="flex items-center justify-center">
              <Image src="/assets/uma.png" alt="UMA" width={250} height={150} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
