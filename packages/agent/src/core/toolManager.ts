import { AgentTools, convertToLangChainTools } from '../types';
import { Logger } from '../utils/logger';
import { DynamicTool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ErrorHandler } from './errorHandler';
import chalk from 'chalk';

export class ToolManager {
  private toolNode: ToolNode;
  private tools: AgentTools;

  constructor(tools: AgentTools) {
    this.tools = tools;
    this.initializeTools();
  }

  private initializeTools(): void {
    const langChainTools = [
      ...convertToLangChainTools(this.tools.readFoilContracts),
      ...convertToLangChainTools(this.tools.writeFoilContracts),
      ...convertToLangChainTools(this.tools.graphql)
    ];

    this.toolNode = new ToolNode(langChainTools);
    Logger.info(`Initialized ${langChainTools.length} tools`);
  }

  public async executeTool(toolName: string, args: any): Promise<any> {
    return ErrorHandler.retry(
      async () => {
        const tool = this.findTool(toolName);
        if (!tool) {
          throw new Error(`Tool ${toolName} not found`);
        }

        Logger.info(chalk.magenta(`Calling ${toolName}`));
        const result = await tool.function(args);
        Logger.info(chalk.magenta(`Tool ${toolName} completed`));

        // Log tool input/output
        const inputStr = JSON.stringify(args);
        const outputStr = JSON.stringify(result);
        Logger.info(chalk.magenta(`Tool ${toolName} input: ${inputStr}`));
        Logger.info(chalk.magenta(`Tool ${toolName} output: ${outputStr.length > 200 ? outputStr.substring(0, 200) + '...' : outputStr}`));

        return result;
      },
      `Tool execution: ${toolName}`
    );
  }

  private findTool(toolName: string): DynamicTool | undefined {
    return Object.values(this.tools.readFoilContracts).find(t => t.name === toolName) ||
           Object.values(this.tools.writeFoilContracts).find(t => t.name === toolName) ||
           Object.values(this.tools.graphql).find(t => t.name === toolName);
  }

  public getToolNode(): ToolNode {
    return this.toolNode;
  }

  public getAvailableTools(): string[] {
    return [
      ...Object.keys(this.tools.readFoilContracts),
      ...Object.keys(this.tools.writeFoilContracts),
      ...Object.keys(this.tools.graphql)
    ];
  }
} 