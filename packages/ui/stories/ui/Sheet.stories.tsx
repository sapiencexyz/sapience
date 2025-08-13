import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";
import {
  Settings,
  User,
  Mail,
  CreditCard,
  Bell,
  Menu,
  Plus,
  Search,
  Filter,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

import { Separator } from "../../components/ui/separator";

const meta: Meta<typeof Sheet> = {
  title: "UI/Sheet",
  component: Sheet,
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
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you're done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              defaultValue="Pedro Duarte"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="username" className="text-right">
              Username
            </Label>
            <Input
              id="username"
              defaultValue="@peduarte"
              className="col-span-3"
            />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="submit">Save changes</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Menu className="mr-2 h-4 w-4" />
          Open Menu
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation Menu</SheetTitle>
          <SheetDescription>
            Browse through different sections of the application.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center space-x-2">
            <User className="h-4 w-4" />
            <span>Profile</span>
          </div>
          <Separator />
          <div className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </div>
          <Separator />
          <div className="flex items-center space-x-2">
            <Mail className="h-4 w-4" />
            <span>Messages</span>
          </div>
          <Separator />
          <div className="flex items-center space-x-2">
            <CreditCard className="h-4 w-4" />
            <span>Billing</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const TopSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Bell className="mr-2 h-4 w-4" />
          Notifications
        </Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            View and manage your notifications.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="font-medium">New message received</p>
              <p className="text-sm text-muted-foreground">
                You have a new message from John Doe
              </p>
            </div>
            <span className="text-xs text-muted-foreground">2 min ago</span>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="font-medium">System update</p>
              <p className="text-sm text-muted-foreground">
                System maintenance scheduled for tonight
              </p>
            </div>
            <span className="text-xs text-muted-foreground">1 hour ago</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const BottomSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add New Item</SheetTitle>
          <SheetDescription>
            Create a new item with the form below.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Title
            </Label>
            <Input
              id="title"
              placeholder="Enter title"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <div className="col-span-3">
              <textarea
                id="description"
                placeholder="Enter description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                rows={3}
              />
            </div>
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button type="submit">Create Item</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div className="space-y-4">
        <div className="flex space-x-2">
          <Button onClick={() => setOpen(true)}>Open Sheet</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close Sheet
          </Button>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Controlled Sheet</SheetTitle>
              <SheetDescription>
                This sheet is controlled by external state.
              </SheetDescription>
            </SheetHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                The sheet state is managed externally and can be controlled
                programmatically.
              </p>
            </div>
            <SheetFooter>
              <SheetClose asChild>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    );
  },
};

export const WithForm: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Create Account</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create New Account</SheetTitle>
          <SheetDescription>
            Fill in the information below to create your account.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="firstName" className="text-right">
              First Name
            </Label>
            <Input id="firstName" placeholder="John" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="lastName" className="text-right">
              Last Name
            </Label>
            <Input id="lastName" placeholder="Doe" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="password" className="text-right">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter password"
              className="col-span-3"
            />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button type="submit">Create Account</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
          Custom Styled Sheet
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-gradient-to-b from-blue-50 to-indigo-100 border-blue-200">
        <SheetHeader>
          <SheetTitle className="text-blue-900">
            Custom Styled Header
          </SheetTitle>
          <SheetDescription className="text-blue-700">
            This sheet has custom styling applied.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <div className="p-4 bg-white rounded-lg border border-blue-200">
            <p className="text-blue-800">
              This content area has a white background with blue borders to
              contrast with the gradient background.
            </p>
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              Custom Button
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const SearchSheet: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Search</SheetTitle>
          <SheetDescription>
            Search through your content and files.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-8" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
              <Filter className="h-4 w-4" />
              <span className="text-sm">Filter by date</span>
            </div>
            <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
              <Filter className="h-4 w-4" />
              <span className="text-sm">Filter by type</span>
            </div>
            <div className="flex items-center space-x-2 p-2 hover:bg-muted rounded">
              <Filter className="h-4 w-4" />
              <span className="text-sm">Filter by status</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const NoHeader: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Simple Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <div className="py-4">
          <h3 className="text-lg font-semibold mb-2">Simple Content</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This sheet doesn't use the header components and has simple content.
          </p>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">Item 1</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
              <span className="text-sm">Item 2</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-purple-500 rounded-full"></div>
              <span className="text-sm">Item 3</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  ),
};
