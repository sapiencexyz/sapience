import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import MarketsTable from "~/lib/components/foil/marketsTable";

const Market = () => {
  return (
    <div className="container mx-auto p-8 max-w-8xl">
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <MarketsTable />
      </Suspense>
    </div>
  );
};

export default Market;
