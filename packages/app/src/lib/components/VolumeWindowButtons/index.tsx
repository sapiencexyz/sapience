import type React from "react";
import type { Dispatch, SetStateAction } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimeWindow } from "~/lib/interfaces/interfaces";

interface VolumeWindowSelectorProps {
  setSelectedWindow: Dispatch<SetStateAction<TimeWindow>>;
  selectedWindow: TimeWindow;
}

const VolumeWindowSelector: React.FC<VolumeWindowSelectorProps> = ({
  setSelectedWindow,
  selectedWindow,
}) => {
  return (
    <Tabs
      value={selectedWindow}
      onValueChange={(value) => setSelectedWindow(value as TimeWindow)}
      className="w-fit"
    >
      <TabsList className="rounded-full p-1">
        {Object.values(TimeWindow).map((window) => (
          <TabsTrigger
            key={window}
            value={window}
            className={`rounded-full px-3 py-1.5 text-sm transition-all
              data-[state=active]:font-bold`}
          >
            {window}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};

export default VolumeWindowSelector;
