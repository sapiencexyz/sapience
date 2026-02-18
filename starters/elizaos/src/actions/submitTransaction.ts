import {
  Action,
  IAgentRuntime,
  Memory,
  HandlerCallback,
  State,
  elizaLogger,
} from "@elizaos/core";
import { loadSdk } from "../utils/sdk.js";

export const submitTransactionAction: Action = {
  name: "SUBMIT_TRANSACTION",
  description: "Submit an EVM transaction using PRIVATE_KEY and RPC_URL envs",
  similes: ["submit tx", "send transaction"],

  validate: async () => true,

  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
  ) => {
    try {
      const text = message.content?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        await callback?.({
          text: 'Provide JSON: {"to":"0x...","data":"0x...","value":"0"}',
          content: {},
        });
        return;
      }
      const tx = JSON.parse(jsonMatch[0]) as {
        to: `0x${string}`;
        data?: `0x${string}`;
        value?: string;
      };

      const privateKey = (process.env.ETHEREUM_PRIVATE_KEY ||
        process.env.EVM_PRIVATE_KEY ||
        process.env.PRIVATE_KEY ||
        process.env.WALLET_PRIVATE_KEY) as `0x${string}` | undefined;
      const rpcUrl = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";
      if (!privateKey) throw new Error("Missing PRIVATE_KEY");

      elizaLogger.info("[SUBMIT_TRANSACTION] Sending transaction", {
        to: tx.to,
        data: tx.data ? `${tx.data.slice(0, 10)}...` : undefined,
        value: tx.value,
        hasPrivateKey: !!privateKey
      } as any);
      
      const { submitTransaction } = await loadSdk();
      const { hash } = await submitTransaction({ rpc: rpcUrl, privateKey, tx });
      
      elizaLogger.info(`[SUBMIT_TRANSACTION] Success! TX Hash: ${hash}`);
      await callback?.({ text: `Submitted tx: ${hash}`, content: { hash } });
    } catch (err: any) {
      await callback?.({
        text: `Submission failed: ${err?.message}`,
        content: {},
      });
    }
  },
};

export default submitTransactionAction;
