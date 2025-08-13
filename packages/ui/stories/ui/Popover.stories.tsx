import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";
import { Calendar, Info, Settings, User } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

const meta: Meta<typeof Popover> = {
  title: "UI/Popover",
  component: Popover,
  parameters: {
    layout: "centered",
    docs: {
      canvas: {
        height: 400,
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    open: {
      control: { type: "boolean" },
    },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open Popover</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Dimensions</h4>
              <p className="text-sm text-muted-foreground">
                Set the dimensions for the layer.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="width">Width</Label>
                <Input
                  id="width"
                  defaultValue="100%"
                  className="col-span-2 h-8"
                />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="maxWidth">Max. width</Label>
                <Input
                  id="maxWidth"
                  defaultValue="300px"
                  className="col-span-2 h-8"
                />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="height">Height</Label>
                <Input
                  id="height"
                  defaultValue="25px"
                  className="col-span-2 h-8"
                />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="maxHeight">Max. height</Label>
                <Input
                  id="maxHeight"
                  defaultValue="none"
                  className="col-span-2 h-8"
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const Simple: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Simple Popover</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Information</h4>
            <p className="text-sm text-muted-foreground">
              This is a simple popover with just some text content.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const WithForm: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Edit Profile</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Edit Profile</h4>
              <p className="text-sm text-muted-foreground">
                Make changes to your profile here.
              </p>
            </div>
            <div className="grid gap-2">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  defaultValue="John Doe"
                  className="col-span-2 h-8"
                />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  defaultValue="@johndoe"
                  className="col-span-2 h-8"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm">Save changes</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Info className="mr-2 h-4 w-4" />
            Information
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-2">
            <h4 className="font-medium leading-none flex items-center">
              <Info className="mr-2 h-4 w-4" />
              Help & Information
            </h4>
            <p className="text-sm text-muted-foreground">
              This popover contains helpful information and tips for using the
              application.
            </p>
            <div className="flex items-center space-x-2 text-sm">
              <User className="h-4 w-4" />
              <span>User Guide</span>
            </div>
            <div className="flex items-center space-x-2 text-sm">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="min-h-[300px] flex items-start justify-center pt-8">
        <div className="space-x-2">
          <Button onClick={() => setOpen(true)}>Open Controlled Popover</Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline">Controlled</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Controlled Popover</h4>
                <p className="text-sm text-muted-foreground">
                  This popover is controlled by React state. Current state:{" "}
                  <span className="font-semibold">
                    {open ? "Open" : "Closed"}
                  </span>
                </p>
                <Button
                  size="sm"
                  onClick={() => setOpen(false)}
                  className="mt-2"
                >
                  Close
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    );
  },
};

export const CustomStyling: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Custom Styled</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 border-2 border-blue-200 bg-blue-50">
          <div className="space-y-2">
            <h4 className="font-medium leading-none text-blue-900">
              Custom Styled Popover
            </h4>
            <p className="text-sm text-blue-700">
              This popover has custom styling with blue colors and borders.
            </p>
            <div className="mt-4">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                Action
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const DifferentAlignments: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <div className="flex space-x-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Center</Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-60">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Center Aligned</h4>
              <p className="text-sm text-muted-foreground">
                This popover is center aligned.
              </p>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Start</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Start Aligned</h4>
              <p className="text-sm text-muted-foreground">
                This popover is start aligned.
              </p>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">End</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">End Aligned</h4>
              <p className="text-sm text-muted-foreground">
                This popover is end aligned.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  ),
};

export const WithCalendar: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Calendar className="mr-2 h-4 w-4" />
            Pick a date
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3">
            <div className="text-sm font-medium">Select a date</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Choose a date from the calendar below.
            </div>
          </div>
          <div className="border-t p-3">
            <div className="grid grid-cols-7 gap-1 text-xs">
              {Array.from({ length: 35 }, (_, i) => (
                <div
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent"
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const LargeContent: Story = {
  render: () => (
    <div className="min-h-[300px] flex items-start justify-center pt-8">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Large Content</Button>
        </PopoverTrigger>
        <PopoverContent className="w-96">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium leading-none">
                Large Content Popover
              </h4>
              <p className="text-sm text-muted-foreground mt-2">
                This popover contains a lot of content to demonstrate how it
                handles larger amounts of information.
              </p>
            </div>
            <div className="space-y-2">
              <h5 className="text-sm font-medium">Features</h5>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Responsive design</li>
                <li>• Custom styling support</li>
                <li>• Keyboard navigation</li>
                <li>• Accessibility features</li>
                <li>• Animation support</li>
              </ul>
            </div>
            <div className="flex justify-end space-x-2">
              <Button size="sm" variant="outline">
                Cancel
              </Button>
              <Button size="sm">Save</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};
