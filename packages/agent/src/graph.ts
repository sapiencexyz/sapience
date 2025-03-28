import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { agentNode } from "./nodes/agent";
import { langChainTools } from "./nodes/tools";

// Create the graph using the prebuilt ReAct agent
export const graph = createReactAgent({
  agent: agentNode,
  tools: langChainTools
}); 