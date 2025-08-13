import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { Skeleton } from "../../components/ui/skeleton";
import { Card, CardContent, CardHeader } from "../../components/ui/card";

const meta: Meta<typeof Skeleton> = {
  title: "UI/Skeleton",
  component: Skeleton,
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
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="space-y-4">
      <Skeleton className="h-4 w-[250px]" />
      <Skeleton className="h-4 w-[200px]" />
      <Skeleton className="h-4 w-[300px]" />
    </div>
  ),
};

export const CardSkeleton: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-4 w-full" />
      </CardHeader>
      <CardContent className="h-[200px]">
        <Skeleton className="h-full w-full" />
      </CardContent>
    </Card>
  ),
};

export const AvatarSkeleton: Story = {
  render: () => (
    <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

export const ListSkeleton: Story = {
  render: () => (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  ),
};

export const FormSkeleton: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-[120px]" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-[80px]" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-[100px]" />
        <Skeleton className="h-10 w-[100px]" />
      </div>
    </div>
  ),
};

export const TableSkeleton: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex space-x-4">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-[150px]" />
        <Skeleton className="h-4 w-[120px]" />
        <Skeleton className="h-4 w-[80px]" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[150px]" />
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-4 w-[80px]" />
        </div>
      ))}
    </div>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <div className="space-y-4">
      <Skeleton className="h-4 w-[250px] bg-blue-200" />
      <Skeleton className="h-4 w-[200px] bg-green-200" />
      <Skeleton className="h-4 w-[300px] bg-purple-200" />
      <Skeleton className="h-12 w-12 rounded-full bg-orange-200" />
      <Skeleton className="h-20 w-full bg-pink-200 rounded-lg" />
    </div>
  ),
};

export const DifferentSizes: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-4 w-4" />
        <span className="text-sm">Small</span>
      </div>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-6 w-6" />
        <span className="text-sm">Medium</span>
      </div>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-8 w-8" />
        <span className="text-sm">Large</span>
      </div>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12" />
        <span className="text-sm">Extra Large</span>
      </div>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-16 w-16" />
        <span className="text-sm">2XL</span>
      </div>
    </div>
  ),
};

export const LoadingState: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Loading Profile</h3>
        <div className="flex items-center space-x-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[150px]" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Loading Content</h3>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Loading Actions</h3>
        <div className="flex space-x-2">
          <Skeleton className="h-10 w-[100px]" />
          <Skeleton className="h-10 w-[100px]" />
          <Skeleton className="h-10 w-[100px]" />
        </div>
      </div>
    </div>
  ),
};

export const ComplexLayout: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[100px]" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <div className="flex space-x-2 pt-4">
            <Skeleton className="h-8 w-[80px]" />
            <Skeleton className="h-8 w-[80px]" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-[200px]" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-[60px]" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-[120px]" />
              <Skeleton className="h-4 w-[80px]" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-[90px]" />
              <Skeleton className="h-4 w-[70px]" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  ),
};

export const AnimatedVariants: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Default Animation</h3>
        <Skeleton className="h-4 w-[250px]" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Custom Animation</h3>
        <Skeleton className="h-4 w-[250px] animate-pulse" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Slow Animation</h3>
        <Skeleton className="h-4 w-[250px] animate-pulse [animation-duration:2s]" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Fast Animation</h3>
        <Skeleton className="h-4 w-[250px] animate-pulse [animation-duration:0.5s]" />
      </div>
    </div>
  ),
};
