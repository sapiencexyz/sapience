import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";
import {
  User,
  CreditCard,
  Bell,
  Activity,
  BarChart3,
  FileText,
  Mail,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";

const meta: Meta<typeof Tabs> = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    defaultValue: {
      control: { type: "text" },
    },
    value: {
      control: { type: "text" },
    },
    onValueChange: {
      action: "valueChanged",
    },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Make changes to your account here. Click save when you're done.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="Pedro Duarte" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@peduarte" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your password here. After saving, you'll be logged out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="account" className="flex items-center space-x-2">
          <User className="h-4 w-4" />
          <span>Account</span>
        </TabsTrigger>
        <TabsTrigger value="billing" className="flex items-center space-x-2">
          <CreditCard className="h-4 w-4" />
          <span>Billing</span>
        </TabsTrigger>
        <TabsTrigger
          value="notifications"
          className="flex items-center space-x-2"
        >
          <Bell className="h-4 w-4" />
          <span>Notifications</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>
              Manage your account settings and preferences.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" defaultValue="UTC" />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="billing">
        <Card>
          <CardHeader>
            <CardTitle>Billing Information</CardTitle>
            <CardDescription>
              Manage your billing and subscription details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card">Card Number</Label>
              <Input id="card" defaultValue="**** **** **** 1234" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry Date</Label>
                <Input id="expiry" defaultValue="12/25" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvv">CVV</Label>
                <Input id="cvv" defaultValue="123" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>
              Configure how you receive notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive email notifications for important updates.
                </p>
              </div>
              <Badge variant="secondary">Enabled</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive push notifications on your device.
                </p>
              </div>
              <Badge variant="outline">Disabled</Badge>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [activeTab, setActiveTab] = useState("overview");

    return (
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-[400px]"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>
                This tab is controlled by external state.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Current tab: <strong>{activeTab}</strong>
              </p>
              <div className="mt-4">
                <Button onClick={() => setActiveTab("analytics")}>
                  Switch to Analytics
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
              <CardDescription>
                View your analytics and performance metrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Activity className="h-4 w-4" />
                  <span className="text-sm">Active users: 1,234</span>
                </div>
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-sm">Revenue: $12,345</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Reports</CardTitle>
              <CardDescription>
                Generate and view detailed reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">Monthly Report</span>
                </div>
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">Quarterly Report</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Manage your notification settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span className="text-sm">Email notifications enabled</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Bell className="h-4 w-4" />
                  <span className="text-sm">Push notifications disabled</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    );
  },
};

export const CustomStyling: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-3 bg-blue-50">
        <TabsTrigger
          value="tab1"
          className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
        >
          Tab 1
        </TabsTrigger>
        <TabsTrigger
          value="tab2"
          className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
        >
          Tab 2
        </TabsTrigger>
        <TabsTrigger
          value="tab3"
          className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
        >
          Tab 3
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Custom Styled Tab 1</CardTitle>
            <CardDescription className="text-blue-700">
              This tab has custom blue styling.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-blue-800">
              The tabs and content have been styled with custom colors.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="tab2">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Custom Styled Tab 2</CardTitle>
            <CardDescription className="text-blue-700">
              Another tab with custom styling.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-blue-800">
              You can customize the appearance of tabs and their content.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="tab3">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Custom Styled Tab 3</CardTitle>
            <CardDescription className="text-blue-700">
              The third tab with custom styling.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-blue-800">
              Custom styling allows for brand-specific designs.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const Vertical: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[600px]">
      <div className="flex space-x-6">
        <TabsList className="flex h-auto flex-col space-y-2 bg-transparent">
          <TabsTrigger
            value="account"
            className="justify-start data-[state=active]:bg-muted"
          >
            Account
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="justify-start data-[state=active]:bg-muted"
          >
            Billing
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="justify-start data-[state=active]:bg-muted"
          >
            Notifications
          </TabsTrigger>
        </TabsList>
        <div className="flex-1">
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account settings and preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" defaultValue="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    defaultValue="john@example.com"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Billing Information</CardTitle>
                <CardDescription>
                  Manage your billing and payment methods.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="card">Card Number</Label>
                  <Input id="card" defaultValue="**** **** **** 1234" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Billing Address</Label>
                  <Input id="address" defaultValue="123 Main St, City, State" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>
                  Configure your notification preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email updates about your account.
                    </p>
                  </div>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive push notifications on your device.
                    </p>
                  </div>
                  <Badge variant="outline">Disabled</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </div>
    </Tabs>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="billing" disabled>
          Billing
        </TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your account settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This is the account tab content.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="billing">
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              This tab is disabled and cannot be accessed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Billing functionality is currently unavailable.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Configure your application settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This is the settings tab content.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const WithBadges: Story = {
  render: () => (
    <Tabs defaultValue="inbox" className="w-[400px]">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="inbox" className="flex items-center space-x-2">
          <span>Inbox</span>
          <Badge variant="secondary" className="ml-auto">
            12
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="sent" className="flex items-center space-x-2">
          <span>Sent</span>
          <Badge variant="outline" className="ml-auto">
            3
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="drafts" className="flex items-center space-x-2">
          <span>Drafts</span>
          <Badge variant="destructive" className="ml-auto">
            5
          </Badge>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inbox">
        <Card>
          <CardHeader>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>
              You have 12 unread messages in your inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  New message from John
                </span>
                <Badge variant="secondary">New</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Meeting reminder</span>
                <Badge variant="outline">Important</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="sent">
        <Card>
          <CardHeader>
            <CardTitle>Sent Messages</CardTitle>
            <CardDescription>
              View your sent messages and their status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You have sent 3 messages this week.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="drafts">
        <Card>
          <CardHeader>
            <CardTitle>Drafts</CardTitle>
            <CardDescription>You have 5 unsaved drafts.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Complete your drafts before they expire.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const LoadingState: Story = {
  render: () => {
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("data");

    const handleTabChange = (value: string) => {
      setIsLoading(true);
      setActiveTab(value);
      // Simulate loading
      setTimeout(() => setIsLoading(false), 1000);
    };

    return (
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-[400px]"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="data" disabled={isLoading}>
            Data
          </TabsTrigger>
          <TabsTrigger value="analytics" disabled={isLoading}>
            Analytics
          </TabsTrigger>
          <TabsTrigger value="reports" disabled={isLoading}>
            Reports
          </TabsTrigger>
        </TabsList>
        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>Data</CardTitle>
              <CardDescription>View and manage your data.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span className="text-sm text-muted-foreground">
                    Loading...
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your data has been loaded successfully.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
              <CardDescription>
                View your analytics and metrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span className="text-sm text-muted-foreground">
                    Loading analytics...
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-4 w-4" />
                    <span className="text-sm">Active users: 1,234</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="text-sm">Revenue: $12,345</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Reports</CardTitle>
              <CardDescription>Generate and view reports.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <span className="text-sm text-muted-foreground">
                    Generating report...
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your reports are ready to view.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    );
  },
};

export const DynamicTabs: Story = {
  render: () => {
    const [tabs, setTabs] = useState([
      { id: "tab1", label: "Tab 1", content: "Content for tab 1" },
      { id: "tab2", label: "Tab 2", content: "Content for tab 2" },
    ]);
    const [activeTab, setActiveTab] = useState("tab1");

    const addTab = () => {
      const newId = `tab${tabs.length + 1}`;
      setTabs([
        ...tabs,
        {
          id: newId,
          label: `Tab ${tabs.length + 1}`,
          content: `Content for ${newId}`,
        },
      ]);
      setActiveTab(newId);
    };

    const removeTab = (id: string) => {
      if (tabs.length > 1) {
        const newTabs = tabs.filter((tab) => tab.id !== id);
        setTabs(newTabs);
        if (activeTab === id) {
          setActiveTab(newTabs[0].id);
        }
      }
    };

    return (
      <div className="w-[500px] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Dynamic Tabs</h3>
          <Button onClick={addTab} size="sm">
            Add Tab
          </Button>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center space-x-2"
              >
                <span>{tab.label}</span>
                {tabs.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTab(tab.id);
                    }}
                  >
                    ×
                  </Button>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{tab.label}</CardTitle>
                  <CardDescription>
                    This is a dynamic tab that can be added or removed.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{tab.content}</p>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  },
};
