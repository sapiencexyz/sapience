import Image from 'next/image';

export const Investors = () => {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-20 md:px-6">
      <div className="grid gap-2.5 space-y-6 py-12 text-center">
        <h1 className="text-sm font-medium uppercase tracking-widest text-gray-500">
          Backed by
        </h1>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <h2 className="text-4xl font-black uppercase tracking-wide">
              Zeal Capital
            </h2>
            <h3>Joe Buttram</h3>
          </div>
          <div>
            <Image
              src="/assets/crucible.png"
              alt="Crucible Capital"
              width={1000}
              height={1000}
              className="h-full w-auto object-contain"
            />
            <h3>Meltem Demirors</h3>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          <div>
            <Image
              src="/assets/cms.png"
              alt="CMS"
              width={1000}
              height={1000}
              className="h-full w-auto object-contain"
            />
          </div>
          <div>
            <Image
              src="/assets/cobie.jpg"
              alt="Cobie"
              width={80}
              height={80}
              className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
            />
            <h2 className="text-xl">Cobie</h2>
            <h4>@cobie</h4>
            <h5 className="align-center text-sm text-muted-foreground">
              via
              <Image
                src="/assets/echo.svg"
                alt="echo"
                width={40}
                height={1}
                className="ml-1.5 inline-block h-6"
              />
            </h5>
          </div>
          <div>
            <Image
              src="/assets/larry.jpg"
              alt="Larry"
              width={80}
              height={80}
              className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
            />
            <h2 className="text-xl">Larry</h2>
            <h4>The Block</h4>
            <h5 className="align-center text-sm text-muted-foreground">
              via
              <Image
                src="/assets/echo.svg"
                alt="echo"
                width={40}
                height={1}
                className="ml-1.5 inline-block h-6"
              />
            </h5>
          </div>
          <div>
            <Image
              src="/assets/publicworks.svg"
              alt="Public Works"
              width={1000}
              height={1000}
              className="h-full w-auto object-contain"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          <div>
            <Image
              src="/assets/ismail.jpg"
              alt="Ismail"
              width={80}
              height={80}
              className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
            />
            <h2 className="text-xl">Ismail</h2>
            <h4>Celestia</h4>
          </div>
          <div>
            <Image
              src="/assets/dean.jpg"
              alt="Dean"
              width={80}
              height={80}
              className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
            />
            <h2 className="text-xl">Dean</h2>
            <h4>@deaneigenmann</h4>
          </div>
          <div>
            <Image
              src="/assets/steven.jpg"
              alt="Steven"
              width={80}
              height={80}
              className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
            />
            <h2 className="text-xl">Steven</h2>
            <h4>The Block</h4>
          </div>
          <div>
            <Image
              src="/assets/maclane.jpg"
              alt="MacLane"
              width={80}
              height={80}
              className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
            />
            <h2 className="text-xl">MacLane</h2>
            <h4>Threshold</h4>
          </div>
        </div>
      </div>
    </div>
  );
};
