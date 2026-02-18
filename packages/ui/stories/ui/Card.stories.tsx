import type { Meta, StoryObj } from "@storybook/react-webpack5";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    className: {
      control: { type: "text" },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card Description</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content goes here.</p>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">Card footer</p>
      </CardFooter>
    </Card>
  ),
};

export const WithContent: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Create project</CardTitle>
        <CardDescription>Deploy your new project in one-click.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          This is a sample card with some content. You can put any content here
          including forms, images, or other components.
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Project Status</CardTitle>
          <Badge variant="secondary">Active</Badge>
        </div>
        <CardDescription>
          Your project is currently running and healthy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Uptime</span>
            <span className="font-medium">99.9%</span>
          </div>
          <div className="flex justify-between">
            <span>Response Time</span>
            <span className="font-medium">120ms</span>
          </div>
          <div className="flex justify-between">
            <span>Users</span>
            <span className="font-medium">1,234</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex items-center">
        <Button variant="outline" className="w-full">
          View Details
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Compact: Story = {
  render: () => (
    <Card className="w-[300px]">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick Info</CardTitle>
        <CardDescription>Brief information card</CardDescription>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm">This is a compact card with less padding.</p>
      </CardContent>
      <CardFooter className="pt-0 flex items-center">
        <Button size="sm" className="w-full">
          Action
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const WithImage: Story = {
  render: () => (
    <Card className="w-[350px] overflow-hidden">
      <div className="aspect-video bg-muted" />
      <CardHeader>
        <CardTitle>Featured Post</CardTitle>
        <CardDescription>
          This card includes an image placeholder at the top.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </p>
      </CardContent>
      <CardFooter className="flex items-center">
        <Button variant="outline" size="sm">
          Read More
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Card className="w-[350px] cursor-pointer transition-all hover:shadow-lg hover:scale-105">
      <CardHeader>
        <CardTitle>Interactive Card</CardTitle>
        <CardDescription>
          This card has hover effects and is clickable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>Hover over this card to see the effects.</p>
      </CardContent>
      <CardFooter className="flex items-center">
        <Button className="w-full">Click Me</Button>
      </CardFooter>
    </Card>
  ),
};

export const MultipleCards: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Card 1</CardTitle>
          <CardDescription>First card in the grid</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Content for the first card.</p>
        </CardContent>
        <CardFooter className="flex items-center">
          <Button size="sm">Action 1</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card 2</CardTitle>
          <CardDescription>Second card in the grid</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Content for the second card.</p>
        </CardContent>
        <CardFooter className="flex items-center">
          <Button size="sm">Action 2</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card 3</CardTitle>
          <CardDescription>Third card in the grid</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Content for the third card.</p>
        </CardContent>
        <CardFooter className="flex items-center">
          <Button size="sm">Action 3</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <Card className="w-[350px] bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200">
      <CardHeader className="border-b border-blue-200">
        <CardTitle className="text-blue-900">Custom Styled Card</CardTitle>
        <CardDescription className="text-blue-700">
          This card has custom styling with gradients and colors.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-blue-800">
        <p>This card uses custom colors and gradients.</p>
      </CardContent>
      <CardFooter className="border-t border-blue-200 flex items-center pt-6">
        <Button className="bg-blue-600 hover:bg-blue-700 w-full">
          Custom Button
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Header Only Card</CardTitle>
        <CardDescription>
          This card only has a header, no content or footer.
        </CardDescription>
      </CardHeader>
    </Card>
  ),
};

export const ContentOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardContent>
        <p>This card only has content, no header or footer.</p>
      </CardContent>
    </Card>
  ),
};

export const FooterOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardFooter className="flex items-center p-6">
        <Button className="w-full">Footer Only Card</Button>
      </CardFooter>
    </Card>
  ),
};
