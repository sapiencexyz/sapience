import type { Meta, StoryObj } from "@storybook/react-webpack5";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";

const meta: Meta<typeof Accordion> = {
  title: "UI/Accordion",
  component: Accordion,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full max-w-lg">
      <AccordionItem value="item-1">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>
          Yes. It adheres to the WAI-ARIA design pattern.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Is it styled?</AccordionTrigger>
        <AccordionContent>
          Yes. It comes with default styles that matches the other
          components&apos; aesthetic.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Is it animated?</AccordionTrigger>
        <AccordionContent>
          Yes. It&apos;s animated by default, but you can disable it if you
          prefer.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-full max-w-lg">
      <AccordionItem value="item-1">
        <AccordionTrigger>What is React?</AccordionTrigger>
        <AccordionContent>
          React is a JavaScript library for building user interfaces. It is
          maintained by Facebook and a community of individual developers and
          companies.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>What is TypeScript?</AccordionTrigger>
        <AccordionContent>
          TypeScript is a programming language developed and maintained by
          Microsoft. It is a strict syntactical superset of JavaScript and adds
          optional static typing to the language.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>What is Tailwind CSS?</AccordionTrigger>
        <AccordionContent>
          Tailwind CSS is a utility-first CSS framework for rapidly building
          custom user interfaces. It is a highly customizable, low-level CSS
          framework that gives you all of the building blocks you need to build
          designs without any annoying opinionated styles you have to fight to
          override.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full max-w-lg">
      <AccordionItem value="item-1" className="border rounded-lg mb-2">
        <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
          Custom styled trigger
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <p className="text-gray-600">
            This accordion item has custom styling with rounded corners and
            hover effects.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" className="border rounded-lg mb-2">
        <AccordionTrigger className="px-4 py-3 hover:bg-gray-50">
          Another custom item
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <p className="text-gray-600">
            You can customize the appearance of each accordion item
            independently.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full max-w-lg">
      <AccordionItem value="item-1">
        <AccordionTrigger className="flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          Features
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-2 text-sm">
            <li>• Responsive design</li>
            <li>• Accessibility compliant</li>
            <li>• Customizable styling</li>
            <li>• Smooth animations</li>
          </ul>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          Benefits
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-2 text-sm">
            <li>• Easy to use</li>
            <li>• Well documented</li>
            <li>• TypeScript support</li>
            <li>• Community driven</li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-full max-w-lg">
      <AccordionItem value="item-1">
        <AccordionTrigger>Enabled item</AccordionTrigger>
        <AccordionContent>
          This item is enabled and can be interacted with.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" className="opacity-50">
        <AccordionTrigger disabled>Disabled item</AccordionTrigger>
        <AccordionContent>
          This item is disabled and cannot be interacted with.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
