import Image from 'next/image';

export const Investors = () => {
  return (
    <div className="my-12 w-full px-4 md:px-14">
      <div className="rounded-4xl border border-border p-8 pt-16 text-center">
        <div className="mx-auto grid max-w-3xl gap-2.5 space-y-6 py-12 text-center">
          <div className="mx-auto mb-6 inline-block rounded-4xl border border-border px-8 py-2.5">
            <h2 className="text-lg font-semibold">Backed By</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:gap-0">
            <div>
              <h2 className="mb-10 mt-2 h-9 text-7xl font-black uppercase tracking-wider">
                Zeal
              </h2>
              <h3 className="font-medium text-muted-foreground">Joe Buttram</h3>
            </div>
            <div>
              <Image
                src="/assets/crucible.png"
                alt="Crucible Capital"
                width={1000}
                height={1000}
                className="mx-auto mb-3.5 mt-3.5 h-14 w-auto object-contain"
              />
              <h3 className="font-medium text-muted-foreground">
                Meltem Demirors
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="order-2 mb-6 md:order-none md:mb-0">
              <Image
                src="/assets/cms.png"
                alt="CMS"
                width={1000}
                height={1000}
                className="h-full w-auto object-contain"
              />
            </div>
            <div className="order-4 md:order-none">
              <Image
                src="/assets/cobie.jpg"
                alt="Cobie"
                width={80}
                height={80}
                className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
              />
              <h2 className="mb-1 text-xl font-semibold">Cobie</h2>
              <h4 className="font-medium text-muted-foreground">@cobie</h4>
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
            <div className="order-5 md:order-none">
              <Image
                src="/assets/larry.jpg"
                alt="Larry"
                width={80}
                height={80}
                className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
              />
              <h2 className="mb-1 text-xl font-semibold">Larry</h2>
              <h4 className="font-medium text-muted-foreground">The Block</h4>
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
            <div className="order-3 mb-6 md:order-none md:mb-0">
              <Image
                src="/assets/publicworks.svg"
                alt="Public Works"
                width={1000}
                height={1000}
                className="h-full w-auto object-contain"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-2">
            <div>
              <Image
                src="/assets/ismail.jpg"
                alt="Ismail"
                width={80}
                height={80}
                className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
              />
              <h2 className="mb-1 text-xl font-semibold">Ismail</h2>
              <h4 className="font-medium text-muted-foreground">Celestia</h4>
            </div>
            <div>
              <Image
                src="/assets/dean.jpg"
                alt="Dean"
                width={80}
                height={80}
                className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
              />
              <h2 className="mb-1 text-xl font-semibold">Dean</h2>
              <h4 className="font-medium text-muted-foreground">
                @deaneigenmann
              </h4>
            </div>
            <div>
              <Image
                src="/assets/steven.jpg"
                alt="Steven"
                width={80}
                height={80}
                className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
              />
              <h2 className="mb-1 text-xl font-semibold">Steven</h2>
              <h4 className="font-medium text-muted-foreground">The Block</h4>
            </div>
            <div>
              <Image
                src="/assets/maclane.jpg"
                alt="MacLane"
                width={80}
                height={80}
                className="mx-auto mb-2 h-[80px] w-[80px] rounded-full object-cover grayscale"
              />
              <h2 className="mb-1 text-xl font-semibold">MacLane</h2>
              <h4 className="font-medium text-muted-foreground">Threshold</h4>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
