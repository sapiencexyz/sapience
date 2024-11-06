import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const FAQ = () => {
  return (
    <div className="grid gap-2.5">
      <h1 className="bg-gradient-to-br from-gray-200 to-teal-700 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
        FAQ
      </h1>
      <Accordion type="single" collapsible>
        <AccordionItem value="what-is-foil">
          <AccordionTrigger>What is Foil?</AccordionTrigger>
          <AccordionContent>
            Foil is a decentralized protocol for peer-to-peer trading of
            exposure to onchain resources like gas and blobspace.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="how-does-foil-work">
          <AccordionTrigger>How does Foil work?</AccordionTrigger>
          <AccordionContent>
            Using the Foil Protocol, users may supply ETH and offer to buy or
            sell exposure to a given period&apos;s average gas or blobs market
            at a price expressed via a Uniswap V3 position. When the period
            ends, position values are automatically fixed at the true average
            price.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="who-should-use-foil">
          <AccordionTrigger>Who should use Foil?</AccordionTrigger>
          <AccordionContent>
            Foil aims to mitigate challenges faced by users and builders with
            tools to stabilize onchain transactional costs. Any users or
            platform developers with regular onchain transaction requirements
            may use Foil to help reduce the impact of unexpected congestion
            pricing.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="transaction-guarantees">
          <AccordionTrigger>
            Does Foil provide guarantees for transaction execution and/or
            inclusion?
          </AccordionTrigger>
          <AccordionContent>
            No, Foil does not affect users&apos; actual transaction submission
            flow in any way.
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="leverage">
          <AccordionTrigger>
            Can I use leverage or be liquidated with Foil?
          </AccordionTrigger>
          <AccordionContent>
            No. The Foil Protocol does not provide any tools for levered
            positions and does not require any liquidation functions.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
