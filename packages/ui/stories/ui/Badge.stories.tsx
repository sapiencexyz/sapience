import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { Badge } from "../../components/ui/badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "secondary", "destructive", "outline"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Badge",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const WithContent: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">New</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="destructive">Error</Badge>
      <Badge variant="outline">Pending</Badge>
    </div>
  ),
};

export const StatusBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">Active</Badge>
      <Badge variant="secondary">Inactive</Badge>
      <Badge variant="destructive">Failed</Badge>
      <Badge variant="outline">Processing</Badge>
    </div>
  ),
};

export const NotificationBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">3</Badge>
      <Badge variant="secondary">12</Badge>
      <Badge variant="destructive">99+</Badge>
      <Badge variant="outline">1</Badge>
    </div>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge className="bg-blue-500 hover:bg-blue-600">Custom Blue</Badge>
      <Badge className="bg-green-500 hover:bg-green-600">Success</Badge>
      <Badge className="bg-purple-500 hover:bg-purple-600">Premium</Badge>
      <Badge className="bg-orange-500 hover:bg-orange-600">Beta</Badge>
    </div>
  ),
};

export const Interactive: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge
        variant="default"
        className="cursor-pointer hover:scale-105 transition-transform"
        onClick={() => alert("Badge clicked!")}
      >
        Clickable
      </Badge>
      <Badge
        variant="secondary"
        className="cursor-pointer hover:scale-105 transition-transform"
        onClick={() => alert("Badge clicked!")}
      >
        Interactive
      </Badge>
    </div>
  ),
};
