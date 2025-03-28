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

  async execute(state: AgentState): Promise<AgentState> {
    try {
      // If there's no AI message with a tool call in the state, something's wrong
      // Return the state unchanged
      const lastMsg = state.messages.find(msg => msg._getType() === 'ai' && (msg as AIMessage).tool_calls?.length > 0);
      if (!lastMsg) {
        Logger.warn("[Tools] No AI message with tool calls found in state");
        return state;
      }

      // Extract only the AI message with the tool calls and its corresponding tool messages
      const aiMsg = lastMsg as AIMessage;
      const toolIds = aiMsg.tool_calls?.map(tc => tc.id) || [];
      
      const toolMessages = state.messages.filter(msg => 
        msg._getType() === 'tool' && 
        toolIds.includes((msg as ToolMessage).tool_call_id)
      );

      // Process tool results and update toolResults in state
      const updatedToolResults = {
        ...state.toolResults,
        ...toolMessages.reduce((acc, msg: ToolMessage) => {
          const toolName = aiMsg.tool_calls?.find(tc => tc.id === msg.tool_call_id)?.name || 'unknown';
          return {
            ...acc,
            [toolName]: msg.content
          };
        }, {})
      };
      
      Logger.info(chalk.magenta("[Tools] Updated tool results in state"));

      // Create a clean state with only the relevant messages
      return {
        ...state,
        messages: [aiMsg, ...toolMessages],
        toolResults: updatedToolResults,
        currentStep: state.currentStep // Preserve the calling node's step
      };
    } catch (error) {
      Logger.error(`Error in ToolsNode: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
} 