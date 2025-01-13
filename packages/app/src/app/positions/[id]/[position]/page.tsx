"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useContext } from "react";

import NumberDisplay from "~/lib/components/foil/numberDisplay";
import { API_BASE_URL } from "~/lib/constants/constants";
import { MarketContext, MarketProvider } from "~/lib/context/MarketProvider";
import { tickToPrice } from "~/lib/util/util";

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const usePosition = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ["position", contractId, positionId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/positions/${positionId}?contractId=${contractId}`,
      );
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    refetchInterval: POLLING_INTERVAL,
  });
};

const useTransactions = (contractId: string, positionId: string) => {
  return useQuery({
    queryKey: ["transactions", contractId, positionId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/transactions?contractId=${contractId}&positionId=${positionId}`,
      );
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
    refetchInterval: POLLING_INTERVAL,
  });
};

const PositionPage = ({
  params,
}: {
  params: { id: string; position: string };
}) => {
  const { id, position } = params;
  const [chainId, marketAddress] = id.split("%3A"); // Decoded contractId
  const positionId = position;

  const contractId = `${chainId}:${marketAddress}`;

  const { pool } = useContext(MarketContext);

  const {
    data: positionData,
    error: positionError,
    isLoading: isLoadingPosition,
  } = usePosition(contractId, positionId);

  const renderPositionData = () => {
    if (isLoadingPosition) {
      return (
        <div className="w-full text-center p-4">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      );
    }
    if (positionError) {
      return (
        <div className="w-full text-center p-4">
          Error: {(positionError as Error).message}
        </div>
      );
    }
    if (positionData) {
      return (
        <div>
          <h1 className="text-2xl font-bold mb-4">Position #{positionId}</h1>
          <ul className="space-y-2 list-disc pl-4">
            <li>Epoch: {positionData.epoch.epochId}</li>
            <li>{positionData.isLP ? "Liquidity Provider" : "Trader"}</li>
            <li>
              Collateral: <NumberDisplay value={positionData.collateral} />{" "}
              wstETH
            </li>
            <li>
              Base Token: <NumberDisplay value={positionData.baseToken} /> Ggas
            </li>
            <li>
              Quote Token: <NumberDisplay value={positionData.quoteToken} />{" "}
              wstETH
            </li>
            <li>
              Borrowed Base Token:{" "}
              <NumberDisplay value={positionData.borrowedBaseToken} /> Ggas
            </li>
            <li>
              Borrowed Quote Token:{" "}
              <NumberDisplay value={positionData.borrowedQuoteToken} /> wstETH
            </li>
            {positionData.isLP ? (
              <>
                <li>
                  Low Price:{" "}
                  <NumberDisplay
                    value={tickToPrice(positionData.lowPriceTick)}
                  />{" "}
                  Ggas/wstETH
                </li>
                <li>
                  High Price:{" "}
                  <NumberDisplay
                    value={tickToPrice(positionData.highPriceTick)}
                  />{" "}
                  Ggas/wstETH
                </li>
              </>
            ) : (
              <li>
                Size:{" "}
                <NumberDisplay
                  value={
                    positionData.baseToken - positionData.borrowedBaseToken
                  }
                />{" "}
                Ggas
              </li>
            )}
            {/* <li>
              Profit/Loss: <NumberDisplay value={pnl} /> wstETH{' '}
              <Tooltip label="This is an estimate that does not take into account slippage or fees.">
                <QuestionOutlineIcon transform="translateY(-2px)" />
              </Tooltip>
            </li> */}
            {positionData.isSettled ? <li>Settled</li> : null}
          </ul>
        </div>
      );
    }
    return null;
  };

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(positionData?.epoch?.id)}
    >
      <div className="flex-1 flex">
        <div className="m-auto border border-border rounded-md p-6 max-w-[460px]">
          {renderPositionData()}
        </div>
      </div>
    </MarketProvider>
  );
};

export default PositionPage;
