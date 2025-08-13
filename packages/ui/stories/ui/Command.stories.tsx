import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";
import {
  Calendar,
  Command as CommandIcon,
  CreditCard,
  File,
  FileText,
  HelpCircle,
  Image,
  Laptop,
  LucideMail,
  Music,
  Settings,
  User,
  Users,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../../components/ui/command";
import { Button } from "../../components/ui/button";

const meta: Meta<typeof Command> = {
  title: "UI/Command",
  component: Command,
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
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <File className="mr-2 h-4 w-4" />
            <span>Search Emails</span>
          </CommandItem>
          <CommandItem>
            <Users className="mr-2 h-4 w-4" />
            <span>Add User</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const WithShortcuts: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <File className="mr-2 h-4 w-4" />
            <span>Search Emails</span>
            <CommandShortcut>⌘E</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <Users className="mr-2 h-4 w-4" />
            <span>Add User</span>
            <CommandShortcut>⌘U</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const MultipleGroups: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Files">
          <CommandItem>
            <File className="mr-2 h-4 w-4" />
            <span>Documents</span>
          </CommandItem>
          <CommandItem>
            <FileText className="mr-2 h-4 w-4" />
            <span>Reports</span>
          </CommandItem>
          <CommandItem>
            <Image className="mr-2 h-4 w-4" />
            <span>Images</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Preferences</span>
          </CommandItem>
          <CommandItem>
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
          </CommandItem>
          <CommandItem>
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>Help</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Applications">
          <CommandItem>
            <Laptop className="mr-2 h-4 w-4" />
            <span>Terminal</span>
          </CommandItem>
          <CommandItem>
            <LucideMail className="mr-2 h-4 w-4" />
            <span>Mail</span>
          </CommandItem>
          <CommandItem>
            <Music className="mr-2 h-4 w-4" />
            <span>Music</span>
          </CommandItem>
          <CommandItem>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Payments</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const Interactive: Story = {
  render: () => {
    const [selectedValue, setSelectedValue] = useState<string>("");

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Selected: {selectedValue || "None"}
        </div>
        <Command className="rounded-lg border shadow-md">
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem onSelect={() => setSelectedValue("Calendar")}>
                <Calendar className="mr-2 h-4 w-4" />
                <span>Calendar</span>
              </CommandItem>
              <CommandItem onSelect={() => setSelectedValue("Search Emails")}>
                <File className="mr-2 h-4 w-4" />
                <span>Search Emails</span>
              </CommandItem>
              <CommandItem onSelect={() => setSelectedValue("Add User")}>
                <Users className="mr-2 h-4 w-4" />
                <span>Add User</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    );
  },
};

export const Compact: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Search..." />
      <CommandList className="max-h-[200px]">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick Actions">
          <CommandItem className="py-2">
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem className="py-2">
            <File className="mr-2 h-4 w-4" />
            <span>Search Emails</span>
          </CommandItem>
          <CommandItem className="py-2">
            <Users className="mr-2 h-4 w-4" />
            <span>Add User</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <Command className="rounded-lg border-2 border-blue-200 bg-blue-50 shadow-md">
      <CommandInput
        placeholder="Type a command or search..."
        className="border-blue-300 focus:border-blue-500"
      />
      <CommandList>
        <CommandEmpty className="text-blue-600">No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions" className="text-blue-900">
          <CommandItem className="hover:bg-blue-100 data-[selected=true]:bg-blue-200">
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem className="hover:bg-blue-100 data-[selected=true]:bg-blue-200">
            <File className="mr-2 h-4 w-4" />
            <span>Search Emails</span>
          </CommandItem>
          <CommandItem className="hover:bg-blue-100 data-[selected=true]:bg-blue-200">
            <Users className="mr-2 h-4 w-4" />
            <span>Add User</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};

export const WithDialog: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>
          <CommandIcon className="mr-2 h-4 w-4" />
          Open Command Menu
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem>
                <Calendar className="mr-2 h-4 w-4" />
                <span>Calendar</span>
              </CommandItem>
              <CommandItem>
                <File className="mr-2 h-4 w-4" />
                <span>Search Emails</span>
              </CommandItem>
              <CommandItem>
                <Users className="mr-2 h-4 w-4" />
                <span>Add User</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </>
    );
  },
};

export const DisabledItems: Story = {
  render: () => (
    <Command className="rounded-lg border shadow-md">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem disabled>
            <File className="mr-2 h-4 w-4" />
            <span>Search Emails (Disabled)</span>
          </CommandItem>
          <CommandItem>
            <Users className="mr-2 h-4 w-4" />
            <span>Add User</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
