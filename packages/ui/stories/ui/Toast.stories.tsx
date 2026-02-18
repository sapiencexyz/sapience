import type { Meta, StoryObj } from "@storybook/react-webpack5";
import * as React from "react";
import { CheckCircle, AlertCircle, Info } from "lucide-react";
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "../../components/ui/toast";
import { Button } from "../../components/ui/button";

const meta: Meta<typeof Toast> = {
  title: "UI/Toast",
  component: Toast,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["default", "destructive"],
    },
  },
};

export default meta;
type Story = StoryObj;

// Wrapper component to provide toast context
const ToastWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <ToastProvider>
      {children}
      <ToastViewport />
    </ToastProvider>
  );
};

// Wrapper for interactive stories with isolated toast context
const InteractiveToastWrapper = ({
  children,
}: {
  children: ({ toast }: { toast: (props: any) => any }) => React.ReactNode;
}) => {
  const [toasts, setToasts] = React.useState<any[]>([]);

  const toast = React.useCallback((props: any) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...props, id, open: true };
    setToasts((prev) => [newToast, ...prev]);

    return {
      id,
      dismiss: () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      update: (updates: any) =>
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
        ),
    };
  }, []);

  const dismiss = React.useCallback((toastId?: string) => {
    if (toastId) {
      setToasts((prev) =>
        prev.map((t) => (t.id === toastId ? { ...t, open: false } : t))
      );
    } else {
      setToasts((prev) => prev.map((t) => ({ ...t, open: false })));
    }
  }, []);

  return (
    <ToastProvider>
      {children({ toast })}
      {toasts.map(({ id, title, description, action, variant, ...props }) => (
        <Toast key={id} variant={variant} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose onClick={() => dismiss(id)} />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
};

export const Default: Story = {
  render: () => (
    <div className="w-[600px] h-[200px] flex items-center justify-center">
      <ToastWrapper>
        <Toast>
          <div className="grid gap-1">
            <ToastTitle>Scheduled: Catch up</ToastTitle>
            <ToastDescription>
              Friday, February 10, 2023 at 3:00 PM
            </ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const WithAction: Story = {
  render: () => (
    <div className="w-[600px] h-[200px] flex items-center justify-center">
      <ToastWrapper>
        <Toast>
          <div className="grid gap-1">
            <ToastTitle>Uh oh! Something went wrong</ToastTitle>
            <ToastDescription>
              There was a problem with your request.
            </ToastDescription>
          </div>
          <ToastAction altText="Try again">Try again</ToastAction>
          <ToastClose />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const Destructive: Story = {
  render: () => (
    <div className="w-[600px] h-[200px] flex items-center justify-center">
      <ToastWrapper>
        <Toast variant="destructive">
          <div className="grid gap-1">
            <ToastTitle>Error</ToastTitle>
            <ToastDescription>
              Your session has expired. Please log in again.
            </ToastDescription>
          </div>
          <ToastAction
            altText="Log in"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Log in
          </ToastAction>
          <ToastClose />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const Success: Story = {
  render: () => (
    <div className="w-[600px] h-[200px] flex items-center justify-center">
      <ToastWrapper>
        <Toast>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <ToastTitle>Success!</ToastTitle>
            </div>
            <ToastDescription>
              Your changes have been saved successfully.
            </ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const Warning: Story = {
  render: () => (
    <div className="w-[600px] h-[200px] flex items-center justify-center">
      <ToastWrapper>
        <Toast>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <ToastTitle>Warning</ToastTitle>
            </div>
            <ToastDescription>
              Your storage is almost full. Consider cleaning up some files.
            </ToastDescription>
          </div>
          <ToastAction altText="Clean up">Clean up</ToastAction>
          <ToastClose />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const Information: Story = {
  render: () => (
    <div className="w-[600px] h-[200px] flex items-center justify-center">
      <ToastWrapper>
        <Toast>
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              <ToastTitle>Information</ToastTitle>
            </div>
            <ToastDescription>
              New features are available in the latest update.
            </ToastDescription>
          </div>
          <ToastAction altText="Learn more">Learn more</ToastAction>
          <ToastClose />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const LongContent: Story = {
  render: () => (
    <div className="w-[600px] h-[250px] flex items-center justify-center">
      <ToastWrapper>
        <Toast>
          <div className="grid gap-1">
            <ToastTitle>Important Update</ToastTitle>
            <ToastDescription>
              This is a very long toast message that demonstrates how the toast
              component handles content that exceeds the normal width. The toast
              will automatically wrap text and maintain proper spacing while
              ensuring the content remains readable and accessible.
            </ToastDescription>
          </div>
          <ToastAction altText="Read more">Read more</ToastAction>
          <ToastClose />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <div className="w-[600px] h-[200px] flex items-center justify-center">
      <ToastWrapper>
        <Toast className="border-blue-200 bg-blue-50 text-blue-900">
          <div className="grid gap-1">
            <ToastTitle className="text-blue-900">
              Custom Styled Toast
            </ToastTitle>
            <ToastDescription className="text-blue-700">
              This toast has custom blue styling applied.
            </ToastDescription>
          </div>
          <ToastAction
            altText="Custom action"
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            Custom Action
          </ToastAction>
          <ToastClose className="text-blue-600 hover:text-blue-800" />
        </Toast>
      </ToastWrapper>
    </div>
  ),
};

export const Interactive: Story = {
  render: () => {
    return (
      <InteractiveToastWrapper>
        {({ toast }) => {
          const showToast = (
            type:
              | "default"
              | "destructive"
              | "success"
              | "warning"
              | "information"
          ) => {
            switch (type) {
              case "default":
                toast({
                  title: "Default Toast",
                  description: "This is a default toast notification.",
                });
                break;
              case "destructive":
                toast({
                  variant: "destructive",
                  title: "Error",
                  description: "Something went wrong. Please try again.",
                  action: (
                    <ToastAction altText="Try again">Try again</ToastAction>
                  ),
                });
                break;
              case "success":
                toast({
                  title: "Success!",
                  description: "Your action was completed successfully.",
                });
                break;
              case "warning":
                toast({
                  title: "Warning",
                  description: "Please review your input before proceeding.",
                  action: <ToastAction altText="Review">Review</ToastAction>,
                });
                break;
              case "information":
                toast({
                  title: "Information",
                  description: "Here's some useful information for you.",
                  action: (
                    <ToastAction altText="Learn more">Learn more</ToastAction>
                  ),
                });
                break;
            }
          };

          return (
            <div className="w-[600px] h-[300px] space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => showToast("default")}>
                  Show Default Toast
                </Button>
                <Button
                  onClick={() => showToast("destructive")}
                  variant="destructive"
                >
                  Show Error Toast
                </Button>
                <Button onClick={() => showToast("success")} variant="outline">
                  Show Success Toast
                </Button>
                <Button onClick={() => showToast("warning")} variant="outline">
                  Show Warning Toast
                </Button>
                <Button
                  onClick={() => showToast("information")}
                  variant="outline"
                >
                  Show Info Toast
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Click the buttons above to see different types of toasts in
                action.
              </p>
            </div>
          );
        }}
      </InteractiveToastWrapper>
    );
  },
};

export const MultipleToasts: Story = {
  render: () => {
    return (
      <InteractiveToastWrapper>
        {({ toast }) => {
          const showMultipleToasts = () => {
            toast({
              title: "First Toast",
              description: "This is the first toast notification.",
            });

            setTimeout(() => {
              toast({
                title: "Second Toast",
                description: "This is the second toast notification.",
              });
            }, 500);

            setTimeout(() => {
              toast({
                title: "Third Toast",
                description: "This is the third toast notification.",
              });
            }, 1000);
          };

          return (
            <div className="w-[600px] h-[300px] space-y-4">
              <Button onClick={showMultipleToasts}>Show Multiple Toasts</Button>
              <p className="text-sm text-muted-foreground">
                Click the button to see multiple toasts appear in sequence.
              </p>
            </div>
          );
        }}
      </InteractiveToastWrapper>
    );
  },
};

export const ToastWithCustomDuration: Story = {
  render: () => {
    return (
      <InteractiveToastWrapper>
        {({ toast }) => {
          const showPersistentToast = () => {
            toast({
              title: "Persistent Toast",
              description:
                "This toast will stay visible until manually dismissed.",
              duration: Infinity, // This makes it persistent
            });
          };

          const showQuickToast = () => {
            toast({
              title: "Quick Toast",
              description: "This toast will disappear quickly.",
              duration: 2000, // 2 seconds
            });
          };

          return (
            <div className="w-[600px] h-[300px] space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={showPersistentToast}>
                  Show Persistent Toast
                </Button>
                <Button onClick={showQuickToast} variant="outline">
                  Show Quick Toast
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                The persistent toast will stay until you close it, while the
                quick toast disappears after 2 seconds.
              </p>
            </div>
          );
        }}
      </InteractiveToastWrapper>
    );
  },
};

export const ToastWithRichContent: Story = {
  render: () => {
    return (
      <InteractiveToastWrapper>
        {({ toast }) => {
          const showRichToast = () => {
            toast({
              title: "Rich Content Toast",
              description: (
                <div className="space-y-2">
                  <p>This toast contains rich content including:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Multiple paragraphs</li>
                    <li>Lists and formatting</li>
                    <li>Custom styling</li>
                  </ul>
                  <div className="flex items-center gap-2 mt-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">
                      Status: Complete
                    </span>
                  </div>
                </div>
              ),
              action: (
                <ToastAction altText="View details">View details</ToastAction>
              ),
            });
          };

          return (
            <div className="w-[600px] h-[300px] space-y-4">
              <Button onClick={showRichToast}>Show Rich Content Toast</Button>
              <p className="text-sm text-muted-foreground">
                This toast demonstrates how to include rich content like lists,
                icons, and custom formatting.
              </p>
            </div>
          );
        }}
      </InteractiveToastWrapper>
    );
  },
};
