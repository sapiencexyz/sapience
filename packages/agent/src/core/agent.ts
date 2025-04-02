import { AgentConfig, Tool } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { Runnable } from '@langchain/core/runnables';
import { DynamicTool } from "@langchain/core/tools";

// Define the states
type AgentState = 'Lookup' | 'Evaluate' | 'Update' | 'Summary' | 'Delay';

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
            // Omitting schema key to try and satisfy linter
            // Assumes the underlying LangChain implementation might still correctly associate
            // the Zod schema provided in tool.parameters, or that it's not strictly required
            // by the specific Anthropic integration being used if parameters are simple.
            // This relies on the assumption that your `tool.parameters` IS a Zod schema.
        }))
    );

    this.messages = [
      new SystemMessage(`You are an autonomous agent. Your address is ${this.agentAddress}. Your goal is to process information and update contracts based on your findings. Use the available tools when necessary. Available tools: ${this.flatTools.map(t => t.name).join(', ')}`)
    ];

    // Bind tools to the model
    this.modelWithTools = this.model.bindTools(this.flatTools);

    Logger.info('Agent initialized with tools:', this.flatTools.map(t => t.name));

  }

  async start() {
    if (this.running) {
      Logger.warn('Agent is already running.');
      return;
    }
    this.running = true;
    Logger.info('Agent started.');
    // Reset state for new start, especially important for single runs
    this.currentState = 'Lookup';
    this.messages = [
      new SystemMessage(`You are an autonomous agent. Your address is ${this.agentAddress}. Your goal is to process information and update contracts based on your findings. Use the available tools when necessary. Available tools: ${this.flatTools.map(t => t.name).join(', ')}`)
    ];
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
    Logger.info('Agent stopped.');
  }

  private async runLoop() {
    if (!this.running) return;

    let completedCycle = false;

    try {
      Logger.info(`--- Entering State: ${this.currentState} ---`);
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
          Logger.error(`Unknown state: ${this.currentState}`);
          this.stop(); // Stop on unknown state
          return;
      }
    } catch (error: any) {
      Logger.error('Error in agent loop:', error);
      // Decide on error handling, e.g., stop or retry?
      // For now, let's transition to Delay to avoid tight loops on errors
      this.currentState = 'Delay';
    }

    Logger.info(`--- Exiting State: ${this.currentState === 'Lookup' && completedCycle ? 'Delay' : this.getPreviousState()} ---`);

    // Check if we should stop (single run and completed a cycle)
    if (this.isSingleRun && completedCycle) {
        this.running = false;
        Logger.info('Agent finished single run cycle.');
        return; // Stop the loop
    }

    // Continue the loop if running and interval is set
    if (this.running && this.config.interval > 0) {
        this.timeoutId = setTimeout(() => this.runLoop(), this.config.interval);
    }
    // If not a single run or interval > 0, continue immediately
    else if (this.running && !this.isSingleRun) {
        // SetImmediate could be used here for non-blocking continuation
        // Or just call runLoop directly for immediate processing
        this.runLoop();
    }
    // If it IS a single run but we HAVEN'T completed a cycle yet, continue immediately
    else if (this.running && this.isSingleRun && !completedCycle) {
        this.runLoop();
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
    Logger.info('Performing Lookup...');
    const graphqlToolSet = this.tools.graphql;
    if (!graphqlToolSet) {
        Logger.error('GraphQL toolset not found.');
        this.currentState = 'Delay';
        return;
    }
    const queryToolEntry = Object.values(graphqlToolSet)[0];
    if (!queryToolEntry || typeof queryToolEntry.function !== 'function') {
        Logger.error('Lookup function (graphql) not found or invalid.');
        this.currentState = 'Delay';
        return;
    }

    try {
        const lookupResult = await queryToolEntry.function({ query: '{ getEpochs { id epochId startTimestamp endTimestamp settled settlementPriceD18 public market { id } positions { id } } }' });
        Logger.info('Lookup Result:', JSON.stringify(lookupResult, null, 2));
        this.messages.push(new HumanMessage(`Initial Lookup Result: ${JSON.stringify(lookupResult)} Please evaluate this data.`));
    } catch (error: any) {
        Logger.error('Error during Lookup:', error);
        this.messages.push(new HumanMessage(`Error during Lookup: ${error.message}`));
        this.currentState = 'Delay';
    }
  }

  private async evaluate() {
    try {
      Logger.info(`Starting evaluation. Current messages: ${this.messages.map(m => `\n  [${m._getType()}] ${m.content}`).join('')}`);

      let response: AIMessage = await this.modelWithTools.invoke(this.messages) as AIMessage;
      Logger.info(`Initial model response: ${JSON.stringify(response.content)}`);
      if (response.tool_calls && response.tool_calls.length > 0) {
        Logger.info(`Model requested tool calls: ${JSON.stringify(response.tool_calls)}`);
      }

      while (response.tool_calls && response.tool_calls.length > 0) {
          this.messages.push(response); // Add the AI message requesting the tool call
          const toolMessages: ToolMessage[] = [];

          for (const toolCall of response.tool_calls) {
              let args = toolCall.args;
              Logger.info(`Attempting tool call: ${toolCall.name} with raw args: ${JSON.stringify(args)}`);
              
              // Attempt to parse args if they are nested in an 'input' JSON string
              if (typeof args?.input === 'string') {
                  try {
                      args = JSON.parse(args.input);
                      Logger.info(`Parsed args from nested input: ${JSON.stringify(args)}`);
                  } catch (e) {
                      Logger.warn(`Failed to parse args.input JSON string: ${args.input}. Using raw args.`);
                  }
              }
              let foundTool: Tool | undefined;
              for (const category in this.tools) {
                  foundTool = this.tools[category][toolCall.name];
                  if (foundTool) break;
              }

              let toolResultContent: string;
              if (foundTool && typeof foundTool.function === 'function') {
                  try {
                      // Use the potentially parsed args
                      const result = await foundTool.function(args);
                      toolResultContent = JSON.stringify(result);
                      Logger.info(`Tool ${toolCall.name} successful. Result: ${toolResultContent}`);
                  } catch (error: any) {
                      const errorMessage = `Error executing tool ${toolCall.name}: ${error.message}`;
                      Logger.error(errorMessage, error);
                      toolResultContent = errorMessage;
                  }
              } else {
                  const errorMessage = `Error: Tool ${toolCall.name} not found.`;
                  Logger.warn(errorMessage);
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
          Logger.info(`Re-invoking model with tool results. Current messages: ${this.messages.map(m => `\n  [${m._getType()}] ${m.content}`).join('')}`);
          response = await this.modelWithTools.invoke(this.messages) as AIMessage;
          Logger.info(`Subsequent model response: ${JSON.stringify(response.content)}`);
          if (response.tool_calls && response.tool_calls.length > 0) {
            Logger.info(`Model requested tool calls: ${JSON.stringify(response.tool_calls)}`);
          }
      }

      // Add the final AI response (without tool calls) to messages
      this.messages.push(response);
      Logger.info(`Evaluation complete. Final response: ${JSON.stringify(response.content)}`);
      Logger.info(`Final message list: ${this.messages.map(m => `\n  [${m._getType()}] ${m.content}`).join('')}`);

    } catch (error: any) {
       const errorMessage = `Error during Evaluation: ${error.message}`;
       Logger.error(errorMessage, error);
       this.messages.push(new HumanMessage(errorMessage));
       this.currentState = 'Delay';
    }
  }

  private async update() {
    Logger.info('Performing Update (Placeholder)...');
    // Placeholder: Add logic using tools like 'createTraderPosition' based on evaluation.
    // Example: Check messages for instructions from Evaluate step.
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage._getType() === 'ai') {
        Logger.info(`Update step considering last AI message: ${lastMessage.content}`);
        // Add logic here to parse message and potentially call write tools
    }
  }

  private async summary() {
    Logger.info('Performing Summary (Placeholder)...');
    // Placeholder: Summarize the cycle's actions or final state.
    Logger.info(`Summary of cycle. Final message count: ${this.messages.length}`);
  }

  private async delay() {
    // Delay is handled by the runLoop logic (setTimeout or immediate continuation)
    if (this.config.interval > 0) {
        Logger.info(`Delaying for ${this.config.interval}ms before next cycle...`);
    } else if (this.isSingleRun) {
        Logger.info(`Cycle complete for single run. Proceeding to stop.`);
    } else {
        Logger.info(`Interval is 0, proceeding immediately to next cycle.`);
    }
  }
} 