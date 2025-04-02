import { AgentConfig, Tool } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { Runnable } from '@langchain/core/runnables';
import { DynamicTool } from "@langchain/core/tools";

// Define ANSI color codes
const colors = {
    reset: "\x1b[0m",
    // Styles
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    // Colors
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m", // Bright black/gray
};

// Define the states
type AgentState = 'Lookup' | 'Evaluate' | 'Update' | 'Summary' | 'Delay';

// Helper to format messages for cleaner logging
function formatMessagesForLog(messages: BaseMessage[]): string {
    return messages.map(m => {
        const type = m._getType().toUpperCase();
        let content = '';
        if (m.content && typeof m.content === 'string') {
            content = m.content;
        } else if (m.content) {
            content = JSON.stringify(m.content); // Basic fallback for non-string content
        }
        // Special handling for AIMessage with tool calls
        if (m._getType() === 'ai' && (m as AIMessage).tool_calls && (m as AIMessage).tool_calls.length > 0) {
            content += ` | Tool Calls: ${JSON.stringify((m as AIMessage).tool_calls)}`;
        }
        return `\n  ${type}: ${content}`;
    }).join('');
}

export class FoilAgent {
  private config: AgentConfig;
  private tools: Record<string, Record<string, Tool>>;
  private flatTools: DynamicTool[];
  private agentAddress: string;
  private currentState: AgentState;
  private messages: BaseMessage[];
  private running: boolean;
  private isSingleRun: boolean; // Track if it's a single run
  private timeoutId: NodeJS.Timeout | null = null;
  private model: ChatAnthropic;
  private modelWithTools: Runnable;

  constructor(config: AgentConfig, tools: Record<string, Record<string, Tool>>, agentAddress: string) {
    this.config = config;
    this.tools = tools;
    this.agentAddress = agentAddress;
    this.currentState = 'Lookup'; // Start with Lookup state
    this.running = false;
    this.isSingleRun = config.interval <= 0; // Determine if it's a single run at init

    if (!config.anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY is required in the agent config');
    }
    this.model = new ChatAnthropic({ 
        apiKey: config.anthropicApiKey,
        modelName: 'claude-3-5-sonnet-20240620'
    });

    // Flatten tools using DynamicTool
    this.flatTools = Object.values(tools).flatMap(toolSet =>
        Object.values(toolSet).map(tool => new DynamicTool({
            name: tool.name,
            description: tool.description,
            func: tool.function
        }))
    );

    this.messages = [
      new SystemMessage(`You are an autonomous agent designed to analyze on-chain market data, identify opportunities or required actions, and interact with Foil contracts. Your address is ${this.agentAddress}. \nYour primary goal is to process information, proactively use the available tools to gather necessary details or perform actions based on the current context, and eventually trigger contract updates. \nAlways analyze the data provided, decide if tools are needed to fulfill the objective, and use them. Do not ask for permission before using tools if they are necessary to achieve the goal implied by the conversation history. \nAvailable tools: ${this.flatTools.map(t => t.name).join(', ')}`)
    ];

    // Bind tools to the model
    this.modelWithTools = this.model.bindTools(this.flatTools);

    // Log initial system message with color
    Logger.info(`${colors.magenta}SYSTEM:${colors.reset} ${this.messages[0].content}`);

  }

  async start() {
    if (this.running) {
      Logger.warn('Agent is already running.');
      return;
    }
    this.running = true;
    Logger.info(`${colors.bold}--- Agent Started ---${colors.reset}`);
    // Reset state and messages for new start
    this.currentState = 'Lookup';
    this.messages = [
      new SystemMessage(`You are an autonomous agent designed to analyze on-chain market data, identify opportunities or required actions, and interact with Foil contracts. Your address is ${this.agentAddress}. \nYour primary goal is to process information, proactively use the available tools to gather necessary details or perform actions based on the current context, and eventually trigger contract updates. \nAlways analyze the data provided, decide if tools are needed to fulfill the objective, and use them. Do not ask for permission before using tools if they are necessary to achieve the goal implied by the conversation history. \nAvailable tools: ${this.flatTools.map(t => t.name).join(', ')}`)
    ];
    // Log system message on restart too
    Logger.info(`${colors.magenta}SYSTEM:${colors.reset} ${this.messages[0].content}`);
    this.runLoop();
  }

  async stop() {
    if (!this.running) {
      Logger.warn('Agent is not running.');
      return;
    }
    this.running = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    Logger.info(`${colors.bold}--- Agent Stopped ---${colors.reset}`);
  }

  private async runLoop() {
    if (!this.running) return;

    let completedCycle = false;
    const previousState = this.getPreviousState(); // Store state before execution

    try {
      // Logger.info(`--- Entering State: ${this.currentState} ---`); // Reduced verbosity
      switch (this.currentState) {
        case 'Lookup':
          await this.lookup();
          this.currentState = 'Evaluate';
          break;
        case 'Evaluate':
          await this.evaluate();
          this.currentState = 'Update';
          break;
        case 'Update':
          await this.update();
          this.currentState = 'Summary';
          break;
        case 'Summary':
          await this.summary();
          this.currentState = 'Delay';
          break;
        case 'Delay':
          await this.delay();
          this.currentState = 'Lookup'; // Loop back to Lookup
          completedCycle = true; // Mark that a full cycle is potentially complete
          break;
        default:
          Logger.error(`${colors.red}Unknown state: ${this.currentState}${colors.reset}`);
          this.stop(); // Stop on unknown state
          return;
      }
    } catch (error: any) {
      Logger.error(`${colors.red}Error during state ${previousState}: ${error.message}${colors.reset}`, error);
      this.currentState = 'Delay';
    }

    // Logger.info(`--- Exiting State: ${previousState} ---`); // Reduced verbosity

    // Check if we should stop (single run and completed a cycle)
    if (this.isSingleRun && completedCycle) {
        this.running = false;
        Logger.info(`${colors.bold}--- Agent finished single run cycle ---${colors.reset}`);
        return; // Stop the loop
    }

    // Continue the loop if running
    if (this.running) {
        if (this.config.interval > 0) {
            this.timeoutId = setTimeout(() => this.runLoop(), this.config.interval);
        } else {
            // If interval is 0, continue immediately (non-blocking)
            setImmediate(() => this.runLoop());
        }
    }
  }

  private getPreviousState(): AgentState {
      switch (this.currentState) {
          case 'Evaluate': return 'Lookup';
          case 'Update': return 'Evaluate';
          case 'Summary': return 'Update';
          case 'Delay': return 'Summary';
          case 'Lookup': return 'Delay'; // After completing a cycle
          default: return 'Lookup'; // Fallback
      }
  }

  private async lookup() {
    Logger.info(`${colors.dim}LOOKUP: Performing initial data lookup...${colors.reset}`);
    const graphqlToolSet = this.tools.graphql;
    if (!graphqlToolSet) {
        Logger.error(`${colors.red}LOOKUP: GraphQL toolset not found.${colors.reset}`);
        this.currentState = 'Delay';
        return;
    }
    const queryToolEntry = Object.values(graphqlToolSet)[0];
    if (!queryToolEntry || typeof queryToolEntry.function !== 'function') {
        Logger.error(`${colors.red}LOOKUP: GraphQL query function not found or invalid.${colors.reset}`);
        this.currentState = 'Delay';
        return;
    }

    try {
        const queryString = '{ getEpochs { id epochId startTimestamp endTimestamp settled settlementPriceD18 public market { id } positions { id } } }';
        // Logger.info(`LOOKUP: Calling ${queryToolEntry.name} with query: ${queryString}`);
        const lookupResult = await queryToolEntry.function({ query: queryString });
        // Logger.info('LOOKUP: Raw Result:', JSON.stringify(lookupResult, null, 2));
        const humanMessageContent = `Initial Lookup Result: ${JSON.stringify(lookupResult)} \nAnalyze this epoch data and use tools to find detailed information about the latest unsettled epoch.`;
        this.messages.push(new HumanMessage(humanMessageContent));
        // Truncate long human message for log view
        const logHumanContent = humanMessageContent.length > 300 ? humanMessageContent.substring(0, 297) + '...' : humanMessageContent;
        Logger.info(`${colors.green}HUMAN:${colors.reset} ${logHumanContent}`);
    } catch (error: any) {
        const errorMessage = `Error during Lookup: ${error.message}`;
        Logger.error(`${colors.red}LOOKUP: ${errorMessage}${colors.reset}`, error);
        this.messages.push(new HumanMessage(errorMessage));
        this.currentState = 'Delay';
    }
  }

  private async evaluate() {
    Logger.info(`${colors.dim}EVALUATE: Starting...${colors.reset}`);
    try {
      // Log the message that triggered this evaluation
      const triggeringMessage = this.messages[this.messages.length - 1];
      if (triggeringMessage) {
        const type = triggeringMessage._getType().toUpperCase();
        const color = type === "HUMAN" ? colors.green : colors.gray; // Color based on type
        let content = triggeringMessage.content;
        if (typeof content !== 'string') content = JSON.stringify(content);
        const logContent = content.length > 300 ? content.substring(0, 297) + '...' : content; // Truncate
        Logger.info(`${color}${type}:${colors.reset} ${logContent}`);
      }

      let response: AIMessage = await this.modelWithTools.invoke(this.messages) as AIMessage;
      let responseContent = response.content && typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      // Log AI response, indicating if tool calls are present
      const toolCallInfo = (response.tool_calls && response.tool_calls.length > 0)
          ? `${colors.gray} | Requesting Tools: ${response.tool_calls.map(tc => tc.name).join(', ')}${colors.reset}`
          : '';
      Logger.info(`${colors.blue}AI:${colors.reset} ${responseContent}${toolCallInfo}`);

      while (response.tool_calls && response.tool_calls.length > 0) {
          this.messages.push(response); // Add the AI message requesting the tool call
          const toolMessages: ToolMessage[] = [];

          for (const toolCall of response.tool_calls) {
              let args = toolCall.args;
              // Logger.info(`EVALUATE: Attempting tool call: ${toolCall.name} with raw args: ${JSON.stringify(args)}`);
              
              // Attempt to parse args if they are nested in an 'input' JSON string
              if (typeof args?.input === 'string') {
                  try {
                      args = JSON.parse(args.input);
                      // Logger.info(`EVALUATE: Parsed args from nested input: ${JSON.stringify(args)}`);
                  } catch (e) {
                      // Logger.warn(`EVALUATE: Failed to parse args.input JSON string: ${args.input}. Using raw args.`);
                  }
              }
              Logger.info(`${colors.cyan}TOOL_CALL:${colors.reset} ${toolCall.name} with args: ${JSON.stringify(args)}`);

              let foundTool: Tool | undefined;
              for (const category in this.tools) {
                  foundTool = this.tools[category][toolCall.name];
                  if (foundTool) break;
              }

              let toolResultContent: string;
              let logResult: string;
              if (foundTool && typeof foundTool.function === 'function') {
                  try {
                      const result = await foundTool.function(args);
                      toolResultContent = JSON.stringify(result);
                      logResult = toolResultContent.length > 200 ? toolResultContent.substring(0, 197) + '...' : toolResultContent; // Truncate long results for logging
                      Logger.info(`${colors.yellow}TOOL_RESULT:${colors.reset} ${toolCall.name} => ${logResult}`);
                  } catch (error: any) {
                      const errorMessage = `Error executing tool ${toolCall.name}: ${error.message}`;
                      Logger.error(`${colors.red}TOOL_ERROR:${colors.reset} ${errorMessage}`, error);
                      toolResultContent = errorMessage;
                  }
              } else {
                  const errorMessage = `Error: Tool ${toolCall.name} not found.`;
                  Logger.warn(`${colors.red}TOOL_ERROR:${colors.reset} ${errorMessage}`); // Use warn level but red color
                  toolResultContent = errorMessage;
              }

              toolMessages.push(new ToolMessage({
                  content: toolResultContent,
                  tool_call_id: toolCall.id!,
              }));
          }

          // Add all tool results to messages
          this.messages.push(...toolMessages);

          // Re-invoke the model with the tool results
          // Logger.info(`EVALUATE: Re-invoking model. Current messages: ${formatMessagesForLog(this.messages)}`);
          response = await this.modelWithTools.invoke(this.messages) as AIMessage;
          responseContent = response.content && typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
          const subsequentToolCallInfo = (response.tool_calls && response.tool_calls.length > 0)
              ? `${colors.gray} | Requesting Tools: ${response.tool_calls.map(tc => tc.name).join(', ')}${colors.reset}`
              : '';
          Logger.info(`${colors.blue}AI:${colors.reset} ${responseContent}${subsequentToolCallInfo}`);
      }

      // Add the final AI response (without tool calls) to messages
      this.messages.push(response);
      Logger.info(`${colors.dim}EVALUATE: Finished.${colors.reset}`);
      // Logger.info(`EVALUATE: Final message list: ${formatMessagesForLog(this.messages)}`);

    } catch (error: any) {
       const errorMessage = `Error during Evaluation: ${error.message}`;
       Logger.error(`${colors.red}EVALUATE: ${errorMessage}${colors.reset}`, error);
       this.messages.push(new HumanMessage(errorMessage));
       this.currentState = 'Delay';
    }
  }

  private async update() {
    Logger.info(`${colors.dim}UPDATE: Performing placeholder update...${colors.reset}`);
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage._getType() === 'ai') {
        let content = lastMessage.content;
        if (typeof content !== 'string') content = JSON.stringify(content);
        Logger.info(`${colors.dim}UPDATE: Considering last AI message: ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}${colors.reset}`);
        // Placeholder: Add logic here to parse message and potentially call write tools
    }
  }

  private async summary() {
    Logger.info(`${colors.dim}SUMMARY: Performing placeholder summary...${colors.reset}`);
    // Logger.info(`SUMMARY: Final message count: ${this.messages.length}`);
  }

  private async delay() {
    // Logger.info('DELAY: Handling delay/cycle end...');
    if (this.isSingleRun && this.currentState === 'Lookup') { // Check if we just completed a cycle
        // Log handled by runLoop
    } else if (this.config.interval > 0) {
        Logger.info(`${colors.dim}DELAY: Waiting ${this.config.interval}ms...${colors.reset}`);
    } else {
        // Logger.info(`DELAY: Interval is 0, proceeding immediately.`);
    }
  }
} 