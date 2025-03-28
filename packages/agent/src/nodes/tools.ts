import { DynamicTool } from "@langchain/core/tools";
import * as tools from "../../tools";
import { MessagesAnnotation } from "@langchain/langgraph";
import { CallbackManagerForToolRun } from "@langchain/core/callbacks/manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { Logger } from '../utils/logger';
import { BaseNode } from './base';
import chalk from 'chalk';

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

/**
 * Special node for handling tool execution
 * Tools are executed in the context of the calling node
 */
export class ToolsNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  public getPrompt(state: AgentState): string {
    return `You are an AI assistant using tools to complete a task.
    
    You have the following tool results:
    ${JSON.stringify(state.toolResults, null, 2)}

    Review these results and determine the next steps.`;
  }

  async shouldContinue(state: AgentState): Promise<string> {
    // Tools node should always return to the calling node
    // The GraphManager will handle the transition back
    Logger.info(chalk.magenta("[Tools] Returning to calling node"));
    return state.currentStep;
  }
} 