import {
  Action,
  elizaLogger,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelType,
  State,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";
import { getApiEndpoints } from "../utils/blockchain.js";

export const attestMarketAction: Action = {
  name: "ATTEST_MARKET",
  similes: [
    "predict market",
    "analyze market",
    "make prediction",
    "attest to market",
  ],
  description:
    "Analyze a prediction market, create an attestation, and submit it on-chain",

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || "";

    // Check for attestation/prediction keywords
    const keywords = ["predict", "attest", "analyze", "market"];
    return keywords.some((keyword) => text.includes(keyword));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
  ): Promise<void> => {
    try {
      const text = message.content?.text || "";

      // Condition-first: detect a bytes32 condition id in the message
      const conditionMatch = text.match(/0x[a-fA-F0-9]{64}/);
      if (conditionMatch) {
        const conditionId = conditionMatch[0] as `0x${string}`;
        elizaLogger.info(
          `Condition-based attestation requested for ${conditionId}`,
        );

        // Fetch condition details (optional, for nicer question text)
        let condition:
          | { id: string; question: string; shortName?: string | null }
          | null = null;
        try {
          const { sapienceGraphql } = getApiEndpoints();
          const query = /* GraphQL */ `
            query ConditionById($id: String!) {
              conditions(where: { id: { equals: $id } }, take: 1) {
                id
                question
                shortName
              }
            }
          `;
          const res = await fetch(sapienceGraphql, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables: { id: conditionId } }),
          });
          const json = await res.json().catch(() => ({}));
          condition = json?.data?.conditions?.[0] || null;
        } catch {}

        // Generate prediction using the agent
        const prompt = `Analyze this condition and respond with ONLY valid JSON:
Question: ${condition?.shortName || condition?.question || "Unknown"}
{
  "probability": <number 0-100>,
  "reasoning": "<analysis under 180 chars>",
  "confidence": <number 0.0-1.0>
}`;
        const response = await runtime.useModel(ModelType.TEXT_SMALL, {
          prompt,
        });
        let prediction: {
          probability: number;
          reasoning: string;
          confidence: number;
        };
        try {
          prediction = JSON.parse(response);
        } catch {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (!jsonMatch)
            throw new Error("Model did not return JSON format for prediction");
          prediction = JSON.parse(jsonMatch[0]);
        }
        if (
          !prediction.probability ||
          !prediction.reasoning ||
          prediction.confidence === undefined
        ) {
          elizaLogger.error("Invalid prediction format:", JSON.stringify(prediction));
          throw new Error("Model returned incomplete prediction data");
        }

        const { buildForecastCalldata } = await loadSdk();
        const calldata = buildForecastCalldata(
          conditionId,
          prediction.probability,
          prediction.reasoning,
        );

        const transactionData = {
          to: calldata.to,
          data: calldata.data,
          value: calldata.value,
        };
        const transactionMessage: Memory = {
          entityId: message.entityId,
          agentId: message.agentId,
          roomId: message.roomId,
          content: {
            text: `Submit this transaction: ${JSON.stringify(transactionData)}`,
            action: "SUBMIT_TRANSACTION",
          },
          createdAt: Date.now(),
        };
        const actions = runtime.actions || [];
        const submitAction = actions.find(
          (a) => a.name === "SUBMIT_TRANSACTION",
        );
        if (submitAction) {
          await submitAction.handler(
            runtime,
            transactionMessage,
            state,
            options,
            callback,
          );
        } else {
          await callback?.({
            text: "Transaction prepared, but SUBMIT_TRANSACTION action is unavailable.",
            content: { transactionData },
          });
        }
        return;
      }

      // Extract market ID from message
      const marketIdMatch = text.match(/market\s*#?(\d+)/i);
      if (!marketIdMatch) {
        await callback?.({
          text: "Please specify a market ID. Example: 'predict market 147'",
          content: {},
        });
        return;
      }

      const marketId = parseInt(marketIdMatch[1]);
      elizaLogger.info(`Analyzing market ${marketId}`);

      const { sapienceGraphql } = getApiEndpoints();
      const marketsQuery = /* GraphQL */ `
        query ActiveMarkets($take: Int!, $skip: Int!) {
          conditions(orderBy: { createdAt: desc }, take: $take, skip: $skip) {
            id
            question
            shortName
            endTime
            claimStatement
            description
            category {
              id
              name
            }
          }
        }
      `;

      const PAGE_SIZE = 100;
      const markets: any[] = [];
      let skip = 0;
      while (true) {
        const marketsRes = await fetch(sapienceGraphql, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: marketsQuery, variables: { take: PAGE_SIZE, skip } }),
        });
        const marketsJson = await marketsRes.json().catch(() => ({}));
        const page = marketsJson?.data?.conditions || [];
        markets.push(...page);
        if (page.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
      }

      if (!markets.length) {
        throw new Error("Failed to fetch markets from Sapience API");
      }

      const marketInfo = markets.find(
        (m: any) => m.id === marketId || m.id === marketId.toString(),
      );

      if (!marketInfo) {
        // Debug: show first market structure
        if (markets.length > 0) {
          console.log(
            "First market object:",
            JSON.stringify(markets[0], null, 2),
          );
        }

        const availableIds = markets
          .map((m: any) => `${m.id} (${typeof m.id})`)
          .slice(0, 10);
        await callback?.({
          text: `Market #${marketId} not found. Looking for marketId=${marketId} (type: ${typeof marketId}). Available market IDs: ${availableIds.join(", ")}`,
          content: {},
        });
        return;
      }

      // Generate prediction using the agent's reasoning
      const predictionPrompt = `
        🔮 Divine this prediction market, oh mystical Sage:
        Prophecy: ${marketInfo.question}
        Current Market Aura: ${marketInfo.currentPrice || 50}% YES
        Trading Energy: ${marketInfo.volume || 0}
        Cosmic Deadline: ${new Date(marketInfo.endTimestamp * 1000).toISOString()}

        Channel your mystical wisdom and respond with ONLY valid JSON (no other text):
        {
          "probability": <number from 0 to 100>,
          "reasoning": "<your sage-like insight in under 180 characters - be mystical, witty, and profound>",
          "confidence": <number from 0.0 to 1.0>
        }

        Example mystical response:
        {"probability": 65, "reasoning": "The data spirits whisper of growing momentum, while market crystals shimmer with cautious optimism ✨", "confidence": 0.7}

        Remember: Your reasoning must be under 180 characters and embody your mystical sage persona!
      `;

      const predictionResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: predictionPrompt,
      });

      let prediction;
      try {
        // Try to parse the response directly
        prediction = JSON.parse(predictionResponse);
      } catch (error) {
        // If parsing fails, try to extract JSON from the response
        const jsonMatch = predictionResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            prediction = JSON.parse(jsonMatch[0]);
          } catch (innerError) {
            elizaLogger.error("Failed to parse extracted JSON:", innerError);
            throw new Error("Model did not return valid JSON for prediction");
          }
        } else {
          throw new Error("Model did not return JSON format for prediction");
        }
      }

      // Validate the prediction object
      if (
        !prediction.probability ||
        !prediction.reasoning ||
        prediction.confidence === undefined
      ) {
        elizaLogger.error("Invalid prediction format:", JSON.stringify(prediction));
        throw new Error("Model returned incomplete prediction data");
      }

      // Extract conditionId from market if available
      const marketConditionId = marketInfo.conditionId || marketInfo.questionId;
      if (!marketConditionId || !marketConditionId.startsWith("0x") || marketConditionId.length !== 66) {
        await callback?.({
          text: `Market #${marketId} does not have a valid conditionId. Please use the condition ID directly: \`attest 0x...\``,
          content: { prediction, marketInfo },
        });
        return;
      }

      const { buildForecastCalldata } = await loadSdk();
      const calldata = buildForecastCalldata(
        marketConditionId as `0x${string}`,
        prediction.probability,
        prediction.reasoning,
      );

      // Format transaction data for submitTransactionAction
      const transactionData = {
        to: calldata.to,
        data: calldata.data,
        value: calldata.value,
      };

      // Create a memory/message with the transaction data that submitTransactionAction can process
      const transactionMessage: Memory = {
        entityId: message.entityId,
        agentId: message.agentId,
        roomId: message.roomId,
        content: {
          text: `Submit this transaction: ${JSON.stringify(transactionData)}`,
          action: "SUBMIT_TRANSACTION",
        },
        createdAt: Date.now(),
      };

      // Get all available actions from runtime
      const actions = runtime.actions || [];

      // Find the SUBMIT_TRANSACTION action from plugin-sapience
      const submitAction = actions.find((a) => a.name === "SUBMIT_TRANSACTION");

      if (submitAction) {
        elizaLogger.info("Found SUBMIT_TRANSACTION action, executing...");

        // Execute the submit transaction action
        try {
          const txResult = await submitAction.handler(
            runtime,
            transactionMessage,
            state,
            options,
            undefined,
          );

          // Send response to user
          const finalResponse = `
📊 **Market Analysis for #${marketId}**

**Question:** ${marketInfo.question}

**My Prediction:** ${prediction.probability}% YES
**Confidence:** ${(prediction.confidence * 100).toFixed(0)}%
**Reasoning:** ${prediction.reasoning}

Transaction submitted to Arbitrum. Check the logs for transaction details.
          `;

          await callback?.({
            text: finalResponse,
            content: {
              prediction,
              marketInfo,
            },
          });

          return;
        } catch (txError) {
          elizaLogger.error("Failed to submit transaction:", txError);
          await callback?.({
            text: `Prediction complete but transaction failed: ${txError.message}`,
            content: { prediction, marketInfo },
          });
        }
      } else {
        elizaLogger.warn(
          "SUBMIT_TRANSACTION action not found, returning transaction data for manual submission",
        );

        // Fallback: just return the transaction data
        const response = `
📊 **Market Analysis for #${marketId}**

**Question:** ${marketInfo.question}

**My Prediction:** ${prediction.probability}% YES
**Confidence:** ${(prediction.confidence * 100).toFixed(0)}%
**Reasoning:** ${prediction.reasoning}

**Transaction Ready:**
${JSON.stringify(transactionData, null, 2)}

To submit: say "submit transaction"
        `;

        await callback?.({
          text: response,
          content: {
            attestation: transactionData,
            prediction,
            marketInfo,
          },
        });
      }

      return;
    } catch (error) {
      elizaLogger.error("Error in attestMarketAction:", error);
      await callback?.({
        text: `Error analyzing market: ${error.message}`,
        content: {},
      });
      return;
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "predict market 147" },
      },
      {
        name: "{{agent}}",
        content: { text: "Analyzing market 147 and generating attestation..." },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "analyze market #89" },
      },
      {
        name: "{{agent}}",
        content: { text: "Let me analyze market 89 for you..." },
      },
    ],
  ],
};
