import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { Separator } from "../../components/ui/separator";

const meta: Meta<typeof Separator> = {
  title: "UI/Separator",
  component: Separator,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: { type: "select" },
      options: ["horizontal", "vertical"],
    },
    decorative: {
      control: { type: "boolean" },
    },
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
      <div>
        <h4 className="text-sm font-medium leading-none">Account</h4>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and set preferences.
        </p>
      </div>
      <Separator />
      <div>
        <h4 className="text-sm font-medium leading-none">Team</h4>
        <p className="text-sm text-muted-foreground">
          Manage your team and set preferences.
        </p>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-[200px] items-center space-x-4">
      <div className="text-sm">Left content</div>
      <Separator orientation="vertical" />
      <div className="text-sm">Right content</div>
    </div>
  ),
};

export const WithLabels: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-sm font-medium leading-none">Account</h4>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and set preferences.
        </p>
      </div>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-medium leading-none">Team</h4>
        <p className="text-sm text-muted-foreground">
          Manage your team and set preferences.
        </p>
      </div>
    </div>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium leading-none">Section 1</h4>
        <p className="text-sm text-muted-foreground">
          This section has a custom styled separator.
        </p>
      </div>
      <Separator className="bg-blue-500 h-0.5" />
      <div>
        <h4 className="text-sm font-medium leading-none">Section 2</h4>
        <p className="text-sm text-muted-foreground">
          This section also has a custom styled separator.
        </p>
      </div>
      <Separator className="bg-green-500 h-1" />
      <div>
        <h4 className="text-sm font-medium leading-none">Section 3</h4>
        <p className="text-sm text-muted-foreground">
          This section has a thick green separator.
        </p>
      </div>
    </div>
  ),
};

export const VerticalCustom: Story = {
  render: () => (
    <div className="flex h-[200px] items-center space-x-4">
      <div className="text-sm">Left content</div>
      <Separator orientation="vertical" className="bg-red-500 w-1" />
      <div className="text-sm">Right content</div>
      <Separator orientation="vertical" className="bg-purple-500 w-2" />
      <div className="text-sm">More content</div>
    </div>
  ),
};

export const InList: Story = {
  render: () => (
    <div className="w-[350px] space-y-1">
      <div className="flex items-center space-x-2">
        <div className="h-4 w-4 rounded-full bg-blue-500" />
        <span className="text-sm">Item 1</span>
      </div>
      <Separator />
      <div className="flex items-center space-x-2">
        <div className="h-4 w-4 rounded-full bg-green-500" />
        <span className="text-sm">Item 2</span>
      </div>
      <Separator />
      <div className="flex items-center space-x-2">
        <div className="h-4 w-4 rounded-full bg-purple-500" />
        <span className="text-sm">Item 3</span>
      </div>
      <Separator />
      <div className="flex items-center space-x-2">
        <div className="h-4 w-4 rounded-full bg-orange-500" />
        <span className="text-sm">Item 4</span>
      </div>
    </div>
  ),
};

export const InForm: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h4 className="text-sm font-medium leading-none">
          Personal Information
        </h4>
        <p className="text-sm text-muted-foreground">
          Enter your personal details below.
        </p>
      </div>
      <Separator />
      <div className="space-y-2">
        <h4 className="text-sm font-medium leading-none">
          Contact Information
        </h4>
        <p className="text-sm text-muted-foreground">
          Enter your contact details below.
        </p>
      </div>
      <Separator />
      <div className="space-y-2">
        <h4 className="text-sm font-medium leading-none">Preferences</h4>
        <p className="text-sm text-muted-foreground">
          Set your account preferences.
        </p>
      </div>
    </div>
  ),
};

export const MultipleOrientations: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Horizontal</h4>
        <div className="space-y-2">
          <div className="text-sm">Content 1</div>
          <Separator />
          <div className="text-sm">Content 2</div>
        </div>
      </div>
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Vertical</h4>
        <div className="flex h-[100px] items-center space-x-2">
          <div className="text-sm">Left</div>
          <Separator orientation="vertical" />
          <div className="text-sm">Right</div>
        </div>
      </div>
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Custom</h4>
        <div className="space-y-2">
          <div className="text-sm">Content 1</div>
          <Separator className="bg-blue-500 h-0.5" />
          <div className="text-sm">Content 2</div>
        </div>
      </div>
    </div>
  ),
};

export const Decorative: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium leading-none">
          Decorative Separator
        </h4>
        <p className="text-sm text-muted-foreground">
          This separator is decorative and not focusable.
        </p>
      </div>
      <Separator decorative={true} />
      <div>
        <h4 className="text-sm font-medium leading-none">
          Non-Decorative Separator
        </h4>
        <p className="text-sm text-muted-foreground">
          This separator is not decorative and can receive focus.
        </p>
      </div>
      <Separator decorative={false} />
      <div>
        <h4 className="text-sm font-medium leading-none">Another Section</h4>
        <p className="text-sm text-muted-foreground">
          This section uses the default decorative separator.
        </p>
      </div>
    </div>
  ),
};
