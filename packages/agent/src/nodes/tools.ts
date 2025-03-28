import { DynamicTool } from "@langchain/core/tools";
import * as tools from "../../tools";
import { MessagesAnnotation } from "@langchain/langgraph";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { RunnableConfig } from "@langchain/core/runnables";

// Convert MCP tools to LangChain tools
export const langChainTools = Object.entries(tools).flatMap(([moduleName, moduleTools]) => 
  Object.entries(moduleTools as Record<string, any>).map(([toolName, tool]) => 
    new DynamicTool({
      name: toolName,
      description: tool.description,
      func: async (
        input: string,
        runManager?: CallbackManagerForToolRun,
        config?: RunnableConfig
      ) => {
        try {
          const result = await tool.function({ input });
          return result.content[0].text;
        } catch (error) {
          console.error(`Error executing tool ${toolName}:`, error);
          throw error;
        }
      }
    })
  )
); 