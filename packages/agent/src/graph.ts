import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { langChainTools } from "./nodes/tools";
import { StateGraph } from "@langchain/langgraph";
import { AgentState } from "./types";
import { ChatAnthropic } from "@langchain/anthropic";
import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { Position } from "./types/position";
import { Market } from "./types/market";
import { Action } from "./types/position";

// Initialize the model
const model = new ChatAnthropic({
  modelName: "claude-3-sonnet-20240229",
  temperature: 0,
  maxTokens: 4096,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY
});

// Define the state channels using Annotation
const GraphState = {
  messages: {
    value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => []
  },
  positions: {
    value: (x: Position[], y: Position[]) => [...x, ...y],
    default: () => []
  },
  markets: {
    value: (x: Market[], y: Market[]) => [...x, ...y],
    default: () => []
  },
  actions: {
    value: (x: Action[], y: Action[]) => [...x, ...y],
    default: () => []
  },
  toolResults: {
    value: (x: Record<string, any>, y: Record<string, any>) => ({ ...x, ...y }),
    default: () => ({})
  },
  currentStep: {
    value: (_: string, y: string) => y,
    default: () => "agent"
  },
  agentAddress: {
    value: (_: string, y: string) => y,
    default: () => ""
  }
};

// Create the graph using the prebuilt ReAct agent
const reactAgent = createReactAgent({
  llm: model,
  tools: langChainTools
});

// Create a state graph that wraps the ReAct agent
export const graph = new StateGraph<AgentState>({
  channels: GraphState
})
  .addNode("agent", reactAgent)
  .setEntryPoint("agent")
  .addEdge("agent", "agent") // Allow agent to loop back to itself after tool calls
  .setFinishPoint("agent"); 