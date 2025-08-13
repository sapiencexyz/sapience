import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

const meta: Meta<typeof ScrollArea> = {
  title: "UI/ScrollArea",
  component: ScrollArea,
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
    <ScrollArea className="h-[200px] w-[350px] rounded-md border p-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium leading-none">Recent Posts</h4>
        <div className="space-y-2">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">Post {i + 1}</p>
                <p className="text-sm text-muted-foreground">
                  This is a sample post description that demonstrates the scroll
                  area.
                </p>
              </div>
              <Badge variant="secondary">New</Badge>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  ),
};

export const WithCards: Story = {
  render: () => (
    <ScrollArea className="h-[300px] w-[400px] rounded-md border p-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium leading-none">Project Cards</h4>
        <div className="space-y-4">
          {Array.from({ length: 15 }, (_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Project {i + 1}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This is a sample project card that demonstrates how the scroll
                  area works with card components.
                </p>
                <div className="mt-2 flex space-x-2">
                  <Badge variant="outline">React</Badge>
                  <Badge variant="outline">TypeScript</Badge>
                  <Badge variant="outline">Tailwind</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ScrollArea>
  ),
};

export const LongText: Story = {
  render: () => (
    <ScrollArea className="h-[250px] w-[400px] rounded-md border p-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium leading-none">Article Content</h4>
        <div className="space-y-4 text-sm">
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat.
          </p>
          <p>
            Duis aute irure dolor in reprehenderit in voluptate velit esse
            cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
            cupidatat non proident, sunt in culpa qui officia deserunt mollit
            anim id est laborum.
          </p>
          <p>
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem
            accusantium doloremque laudantium, totam rem aperiam, eaque ipsa
            quae ab illo inventore veritatis et quasi architecto beatae vitae
            dicta sunt explicabo.
          </p>
          <p>
            Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut
            fugit, sed quia consequuntur magni dolores eos qui ratione
            voluptatem sequi nesciunt.
          </p>
          <p>
            Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet,
            consectetur, adipisci velit, sed quia non numquam eius modi tempora
            incidunt ut labore et dolore magnam aliquam quaerat voluptatem.
          </p>
          <p>
            Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis
            suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis
            autem vel eum iure reprehenderit qui in ea voluptate velit esse quam
            nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo
            voluptas nulla pariatur?
          </p>
        </div>
      </div>
    </ScrollArea>
  ),
};

export const ListItems: Story = {
  render: () => (
    <ScrollArea className="h-[200px] w-[300px] rounded-md border p-4">
      <div className="space-y-2">
        <h4 className="text-sm font-medium leading-none">Todo List</h4>
        <div className="space-y-2">
          {Array.from({ length: 25 }, (_, i) => (
            <div
              key={i}
              className="flex items-center space-x-2 rounded-md border p-3"
            >
              <div className="h-2 w-2 rounded-full bg-muted" />
              <span className="text-sm">Task {i + 1}</span>
              <Badge variant="secondary" className="ml-auto">
                {i % 3 === 0 ? "High" : i % 3 === 1 ? "Medium" : "Low"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <ScrollArea className="h-[250px] w-[350px] rounded-md border-2 border-blue-200 bg-blue-50 p-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium leading-none text-blue-900">
          Custom Styled Scroll Area
        </h4>
        <div className="space-y-2">
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              className="rounded-md border border-blue-200 bg-white p-3"
            >
              <p className="text-sm font-medium text-blue-900">Item {i + 1}</p>
              <p className="text-sm text-blue-700">
                This item has custom styling with blue colors.
              </p>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="h-[100px] w-[400px] rounded-md border p-4">
      <div className="flex space-x-4">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="flex-shrink-0 rounded-md border p-4 w-[200px]"
          >
            <h4 className="text-sm font-medium">Card {i + 1}</h4>
            <p className="text-sm text-muted-foreground mt-2">
              This is a horizontally scrollable card.
            </p>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Compact: Story = {
  render: () => (
    <ScrollArea className="h-[150px] w-[300px] rounded-md border p-3">
      <div className="space-y-2">
        <h4 className="text-xs font-medium leading-none">Compact List</h4>
        <div className="space-y-1">
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={i}
              className="flex items-center space-x-2 rounded-sm border p-2"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="text-xs">Item {i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  ),
};

export const WithImages: Story = {
  render: () => (
    <ScrollArea className="h-[300px] w-[400px] rounded-md border p-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium leading-none">Image Gallery</h4>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-md bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  Image {i + 1}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Sample image description
              </p>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  ),
};
