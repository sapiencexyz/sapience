import type { Meta, StoryObj } from "@storybook/react-webpack5";
import * as React from "react";
import { Info, HelpCircle, AlertCircle, CheckCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";

const meta: Meta<typeof Tooltip> = {
  title: "UI / Tooltip",
  component: Tooltip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    delayDuration: {
      control: { type: "number" },
    },
  },
};

export default meta;
type Story = StoryObj;

// Wrapper component to provide tooltip context
const TooltipWrapper = ({ children }: { children: React.ReactNode }) => {
  return <TooltipProvider>{children}</TooltipProvider>;
};

// Container component to provide adequate space for tooltips
const StoryContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-[200px] p-8 flex items-center justify-center">
      {children}
    </div>
  );
};

export const Default: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>This is a default tooltip</p>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm">
              <Info className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click for more information</p>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const WithDelay: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <div className="flex gap-4">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button variant="outline">No delay</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Appears immediately</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button variant="outline">500ms delay</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Appears after 500ms</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <Button variant="outline">1s delay</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Appears after 1 second</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const DifferentPositions: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <div className="flex flex-wrap gap-4 items-center justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Top</Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Tooltip on top</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Right</Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Tooltip on right</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Bottom</Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Tooltip on bottom</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Left</Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Tooltip on left</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const WithStatusIcons: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <div className="flex gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Success - Everything is working correctly</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Warning - Please review this item</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <HelpCircle className="h-4 w-4 text-blue-600" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Help - Click for more information</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="cursor-help">
              Beta
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>This feature is in beta testing</p>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Custom styled tooltip</Button>
          </TooltipTrigger>
          <TooltipContent className="bg-blue-600 text-white border-blue-700">
            <p>This tooltip has custom blue styling</p>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const LongContent: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Long content tooltip</Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p>
              This is a very long tooltip that demonstrates how the tooltip
              component handles content that exceeds the normal width. The
              tooltip will automatically wrap text and maintain proper spacing.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const WithActions: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Tooltip with actions</Button>
          </TooltipTrigger>
          <TooltipContent className="p-2">
            <div className="space-y-2">
              <p className="text-sm">Quick actions:</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline">
                  Edit
                </Button>
                <Button size="sm" variant="outline">
                  Delete
                </Button>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const Disabled: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" disabled>
              Disabled button
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>This button is disabled</p>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const MultipleTooltips: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <div className="flex flex-wrap gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">First tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>This is the first tooltip</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Second tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>This is the second tooltip</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Third tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>This is the third tooltip</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const Interactive: Story = {
  render: () => {
    const [count, setCount] = React.useState(0);

    return (
      <StoryContainer>
        <TooltipWrapper>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" onClick={() => setCount(count + 1)}>
                Click me ({count})
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>You've clicked {count} times</p>
            </TooltipContent>
          </Tooltip>
        </TooltipWrapper>
      </StoryContainer>
    );
  },
};

export const WithFormElements: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <HelpCircle className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Enter your email address</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Info className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Password must be at least 8 characters</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipWrapper>
    </StoryContainer>
  ),
};

export const WithRichContent: Story = {
  render: () => (
    <StoryContainer>
      <TooltipWrapper>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Rich content tooltip</Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium">Success</span>
              </div>
              <p className="text-sm">
                This tooltip contains rich content including icons, formatting,
                and multiple elements.
              </p>
              <div className="flex gap-1">
                <Badge variant="outline" className="text-xs">
                  Feature
                </Badge>
                <Badge variant="outline" className="text-xs">
                  New
                </Badge>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipWrapper>
    </StoryContainer>
  ),
};
