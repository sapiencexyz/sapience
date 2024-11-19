import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const FAQ = () => {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16 md:px-6">
      <div className="grid gap-2.5">
        <div className="mx-auto mb-14 inline-block rounded-4xl border border-border bg-white px-8 py-2.5">
          <h2 className="text-lg font-semibold">FAQ</h2>
        </div>
        <Accordion type="single" collapsible>
          <AccordionItem value="what-is-foil">
            <AccordionTrigger>What is Foil?</AccordionTrigger>
            <AccordionContent>
              <p className="mb-2 text-lg leading-relaxed text-muted-foreground">
                Foil is a decentralized protocol for peer-to-peer trading of
                exposure to onchain resources like gas and blobspace.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="how-does-foil-work">
            <AccordionTrigger>How does Foil work?</AccordionTrigger>
            <AccordionContent>
              <p className="mb-2 text-lg leading-relaxed text-muted-foreground">
                Using the Foil Protocol, users may supply ETH and offer to buy
                or sell exposure to a given period&apos;s average gas or blobs
                market at a price expressed via a Uniswap V3 position. When the
                period ends, position values are automatically fixed at the true
                average price.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="who-should-use-foil">
            <AccordionTrigger>Who should use Foil?</AccordionTrigger>
            <AccordionContent>
              <p className="mb-2 text-lg leading-relaxed text-muted-foreground">
                Foil aims to mitigate challenges faced by users and builders
                with tools to stabilize onchain transactional costs. Any users
                or platform developers with regular onchain transaction
                requirements may use Foil to help reduce the impact of
                unexpected congestion pricing.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="transaction-guarantees">
            <AccordionTrigger className="text-left">
              Does Foil provide guarantees for transaction execution and/or
              inclusion?
            </AccordionTrigger>
            <AccordionContent>
              <p className="mb-2 text-lg leading-relaxed text-muted-foreground">
                No, Foil does not affect users&apos; actual transaction
                submission flow in any way.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="leverage">
            <AccordionTrigger className="text-left">
              Can I use leverage or be liquidated with Foil?
            </AccordionTrigger>
            <AccordionContent>
              <p className="mb-2 text-lg leading-relaxed text-muted-foreground">
                No. The Foil Protocol does not provide any tools for levered
                positions and does not require any liquidation functions.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};
