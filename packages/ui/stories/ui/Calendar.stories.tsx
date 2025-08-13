import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { useState } from "react";
import type { DateRange as DateRangeType } from "react-day-picker";
import { Calendar } from "../../components/ui/calendar";

const meta: Meta<typeof Calendar> = {
  title: "UI/Calendar",
  component: Calendar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    mode: {
      control: { type: "select" },
      options: ["single", "multiple", "range"],
    },
    showOutsideDays: {
      control: { type: "boolean" },
    },
    disabled: {
      control: { type: "object" },
    },
  },
};

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => <Calendar />,
};

export const WithDateSelection: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Selected: {date ? date.toDateString() : "No date selected"}
        </div>
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-md border"
        />
      </div>
    );
  },
};

export const MultipleSelection: Story = {
  render: () => {
    const [dates, setDates] = useState<Date[]>([]);

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Selected: {dates.length} dates
        </div>
        <Calendar
          mode="multiple"
          selected={dates}
          onSelect={(days) => setDates(days || [])}
          className="rounded-md border"
        />
      </div>
    );
  },
};

export const DateRange: Story = {
  render: () => {
    const [dateRange, setDateRange] = useState<DateRangeType | undefined>(
      undefined
    );

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                From: {dateRange.from.toDateString()} - To:{" "}
                {dateRange.to.toDateString()}
              </>
            ) : (
              `From: ${dateRange.from.toDateString()}`
            )
          ) : (
            "No date range selected"
          )}
        </div>
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={setDateRange}
          className="rounded-md border"
        />
      </div>
    );
  },
};

export const WithDisabledDates: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());

    // Disable weekends and past dates
    const disabled = {
      before: new Date(),
      after: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    };

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Selected: {date ? date.toDateString() : "No date selected"}
        </div>
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          disabled={disabled}
          className="rounded-md border"
        />
      </div>
    );
  },
};

export const WithoutOutsideDays: Story = {
  render: () => (
    <Calendar showOutsideDays={false} className="rounded-md border" />
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <Calendar
      className="rounded-lg border-2 border-blue-200 bg-blue-50"
      classNames={{
        day: "hover:bg-blue-100 focus:bg-blue-100",
        day_selected: "bg-blue-500 text-white hover:bg-blue-600",
        day_today: "bg-blue-200 text-blue-900",
      }}
    />
  ),
};

export const WithFooter: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());

    return (
      <div className="space-y-4">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-md border"
          footer={
            <div className="p-3 border-t bg-muted/50">
              <p className="text-xs text-muted-foreground">
                Today is {new Date().toLocaleDateString()}
              </p>
            </div>
          }
        />
      </div>
    );
  },
};

export const Compact: Story = {
  render: () => (
    <Calendar
      className="rounded-md border"
      classNames={{
        months: "flex flex-col space-y-2",
        month: "space-y-2",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-xs font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-7 font-normal text-[0.7rem]",
        row: "flex w-full mt-1",
        cell: "h-7 w-7 text-center text-xs p-0 relative",
        day: "h-7 w-7 p-0 font-normal aria-selected:opacity-100",
      }}
    />
  ),
};
