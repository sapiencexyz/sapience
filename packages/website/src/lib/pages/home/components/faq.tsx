import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const FAQ = () => {
  return (
    <div className="w-full px-4 md:px-14">
      <div className="rounded-4xl border border-border p-8 md:pt-16">
        <div className="flex flex-col items-center">
          <div className="mx-auto inline-block rounded-4xl border border-border px-8 py-2.5">
            <h2 className="text-lg font-semibold">FAQ</h2>
          </div>
        </div>
        <div className="p-4 md:px-24 md:py-8">
          <Accordion type="single" collapsible>
            <AccordionItem value="what-is-foil">
              <AccordionTrigger className="text-left hover:no-underline md:my-2">
                <span className="text-lg font-bold md:text-3xl">
                  What is Foil?
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-4 text-lg md:text-2xl">
                  Foil is a decentralized protocol for peer-to-peer trading of
                  exposure to onchain resources like gas and blobspace.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="how-does-foil-work">
              <AccordionTrigger className="text-left hover:no-underline md:my-2">
                <span className="text-lg font-bold md:text-3xl">
                  How does Foil work?
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-4 text-lg md:text-2xl">
                  Using the Foil Protocol, users may supply ETH and offer to buy
                  or sell exposure to a given period&apos;s average gas or blobs
                  market at a price expressed via a Uniswap V3 position. When
                  the period ends, position values are automatically fixed at
                  the true average price.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="who-should-use-foil">
              <AccordionTrigger className="text-left hover:no-underline md:my-2">
                <span className="text-lg font-bold md:text-3xl">
                  Who should use Foil?
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-4 text-lg md:text-2xl">
                  Foil aims to mitigate challenges faced by users and builders
                  with tools to stabilize onchain transactional costs. Any users
                  or platform developers with regular onchain transaction
                  requirements may use Foil to help reduce the impact of
                  unexpected congestion pricing.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="transaction-guarantees">
              <AccordionTrigger className="text-left hover:no-underline md:my-2">
                <span className="text-lg font-bold md:text-3xl">
                  Does Foil provide guarantees for transaction execution and/or
                  inclusion?
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-4 text-lg md:text-2xl">
                  No, Foil does not affect users&apos; actual transaction
                  submission flow in any way.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="leverage">
              <AccordionTrigger className="text-left hover:no-underline md:my-2">
                <span className="text-lg font-bold md:text-3xl">
                  Can I use leverage or be liquidated with Foil?
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-4 text-lg md:text-2xl">
                  No. The Foil Protocol does not provide any tools for levered
                  positions and does not require any liquidation functions.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
};
