import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";
import { SearchBar } from "../../components/SearchBar";

const meta: Meta<typeof SearchBar> = {
  title: "UI/SearchBar",
  component: SearchBar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    isMobile: {
      control: { type: "boolean" },
      description: "Whether the component is being used on a mobile device",
    },
    value: {
      control: { type: "text" },
      description: "The current search value",
    },
    onChange: {
      action: "changed",
      description: "Callback function when the search value changes",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Interactive wrapper component for stories
const SearchBarWrapper = (args: Omit<typeof SearchBar, "onChange">) => {
  const [value, setValue] = useState(args.value || "");

  return (
    <div className="w-96">
      <SearchBar
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
};

export const Default: Story = {
  render: (args) => <SearchBarWrapper {...args} />,
  args: {
    isMobile: false,
    value: "",
  },
};

export const Mobile: Story = {
  render: (args) => <SearchBarWrapper {...args} />,
  args: {
    isMobile: true,
    value: "",
  },
};

export const WithValue: Story = {
  render: (args) => <SearchBarWrapper {...args} />,
  args: {
    isMobile: false,
    value: "Sample search query",
  },
};

export const MobileWithValue: Story = {
  render: (args) => <SearchBarWrapper {...args} />,
  args: {
    isMobile: true,
    value: "Mobile search",
  },
};

export const DesktopAndMobile: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium mb-2">Desktop</h3>
        <SearchBarWrapper isMobile={false} value="" />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Mobile</h3>
        <SearchBarWrapper isMobile={true} value="" />
      </div>
    </div>
  ),
};

export const WithLongText: Story = {
  render: (args) => <SearchBarWrapper {...args} />,
  args: {
    isMobile: false,
    value:
      "This is a very long search query that should demonstrate how the component handles longer text input",
  },
};
