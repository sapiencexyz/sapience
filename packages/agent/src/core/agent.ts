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
  private evaluationTasks: { market: any, question: string }[] = [];
  // Define the type for evaluation results explicitly for clarity
  private evaluationResults: ({ market: string; question: string; rawResponse: string; parsed: { answer: string; confidence: number; rationale: string; }; } | { market: string; question: string; error: string; })[] = [];

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
    // Log system message on start
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
    Logger.info(`${colors.dim}LOOKUP: Fetching markets for evaluation...${colors.reset}`);
    this.evaluationTasks = []; // Clear previous tasks

    const listMarketsTool = this.flatTools.find(t => t.name === 'listMarkets');

    if (!listMarketsTool) {
        Logger.error(`${colors.red}LOOKUP: listMarkets tool not found.${colors.reset}`);
        this.currentState = 'Delay'; // Skip evaluation if tool is missing
        return;
    }

    try {
        // Assuming listMarkets returns an array of market objects
        // And the function exists within the tool definition
        const marketsResult = await listMarketsTool.func('{}'); // Pass empty JSON string
        let markets: any[] = [];

        // --- Result Parsing Logic ---
        let rawResultContent = marketsResult;
        if (typeof marketsResult === 'string') {
            try {
                rawResultContent = JSON.parse(marketsResult);
            } catch (e) {
                Logger.error(`${colors.red}LOOKUP: Failed to parse listMarkets result string: ${marketsResult}${colors.reset}`);
                this.currentState = 'Delay';
                return;
            }
        }

        if (Array.isArray(rawResultContent?.content) && rawResultContent.content.length > 0 && rawResultContent.content[0].type === 'text') {
             try {
                 markets = JSON.parse(rawResultContent.content[0].text);
                 if (!Array.isArray(markets)) {
                     throw new Error("Parsed market data is not an array.");
                 }
             } catch(e: any) {
                 Logger.error(`${colors.red}LOOKUP: Failed to parse market array from tool result text: ${e.message}${colors.reset}`);
                 this.currentState = 'Delay';
                 return;
             }
        } else if (Array.isArray(rawResultContent)) {
             markets = rawResultContent;
        } else {
            Logger.error(`${colors.red}LOOKUP: Unexpected structure in listMarkets result: ${JSON.stringify(rawResultContent)}${colors.reset}`);
            this.currentState = 'Delay';
            return;
        }
        // --- End Result Parsing Logic ---


        if (!markets || markets.length === 0) {
             Logger.warn(`${colors.yellow}LOOKUP: No markets returned by listMarkets tool.${colors.reset}`);
             this.currentState = 'Delay'; // Skip evaluation if no markets
             return;
        }

        Logger.info(`${colors.dim}LOOKUP: Preparing evaluation tasks for ${markets.length} epoch(s)...${colors.reset}`);
        for (const epoch of markets) {
            const marketIdentifier = epoch.marketAddress || `EpochID-${epoch.epochId}` || 'Unknown ID';
            const claimStatement = epoch.question;

            // Define the standard question for each market, ensuring claimStatement is included
            const question = `Analyze market ${marketIdentifier} with claim: "${claimStatement || 'N/A'}". What is the current outlook? Provide your best estimate, your confidence in this estimate on a scale of 0 to 100, and a rationale. Your response should look like\\n\\nANSWER: \\nCONFIDENCE:\\nRATIONALE:`;
            
            // Pass the epoch object and the generated question to the task
            this.evaluationTasks.push({ market: epoch, question: question });
        }

    } catch (error: any) {
        const errorMessage = `Error during Lookup/listMarkets: ${error.message}`;
        Logger.error(`${colors.red}LOOKUP: ${errorMessage}${colors.reset}`, error);
        this.currentState = 'Delay';
    }
  }

  private async evaluate() {
    Logger.info(`${colors.dim}EVALUATE: Starting parallel market evaluation for ${this.evaluationTasks.length} task(s)...${colors.reset}`);

    if (this.evaluationTasks.length === 0) {
      Logger.warn(`${colors.yellow}EVALUATE: No tasks prepared by Lookup step. Skipping evaluation.${colors.reset}`);
      this.currentState = 'Update'; // Proceed to next step even if no tasks
      return;
    }

    try {
      const evaluationPromises = this.evaluationTasks.map(async (task) => {
        // Access marketAddress and epochId from the epoch object stored in task.market
        const marketIdentifier = task.market.marketAddress || `EpochID-${task.market.epochId}` || 'Unknown ID';
        Logger.info(`${colors.dim}EVALUATE: Starting task for market: ${marketIdentifier}${colors.reset}`);

        // Create a minimal message list for this specific task's context
        const taskMessages: BaseMessage[] = [
            this.messages[0], // Include the original System Message
            new HumanMessage(task.question) // The specific question for this market
        ];

        // Log the prompt being sent
        Logger.info(`${colors.green}EVALUATE (Prompt):${colors.reset} Market ${marketIdentifier}\n${task.question}`);

        try {
          // Use the base model, no tools needed for the structured answer
          const response = await this.model.invoke(taskMessages) as AIMessage;
          const responseContent = response.content && typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

          // Basic parsing attempt
          const answerMatch = responseContent.match(/ANSWER:\\s*([\\s\\S]*?)\\s*CONFIDENCE:/);
          const confidenceMatch = responseContent.match(/CONFIDENCE:\\s*(\\d+)/);
          const rationaleMatch = responseContent.match(/RATIONALE:\\s*([\\s\\S]*)/);

          const result = {
            market: marketIdentifier,
            question: task.question,
            rawResponse: responseContent,
            parsed: {
              answer: answerMatch ? answerMatch[1].trim() : 'Parsing Error',
              confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : -1,
              rationale: rationaleMatch ? rationaleMatch[1].trim() : 'Parsing Error'
            }
          };
          Logger.info(`${colors.blue}EVALUATE (Result):${colors.reset} Market ${marketIdentifier} -> Confidence: ${result.parsed.confidence}`);
          return result;

        } catch (error: any) {
          const errorMessage = `Error evaluating market ${marketIdentifier}: ${error.message}`;
          Logger.error(`${colors.red}EVALUATE (Task Error): ${errorMessage}${colors.reset}`, error);
          return { market: marketIdentifier, question: task.question, error: errorMessage }; // Store the correct identifier in error case
        }
      });

      // Wait for all parallel evaluations to complete
      const results = await Promise.all(evaluationPromises);

      Logger.info(`${colors.dim}EVALUATE: Finished all parallel tasks.${colors.reset}`);

      // Store results for the update step
      this.evaluationResults = results;
      Logger.info(`${colors.dim}EVALUATE: Stored ${this.evaluationResults.length} results for Update step.${colors.reset}`);

      // Clear tasks for the next cycle
      this.evaluationTasks = [];

    } catch (error: any) {
       // Error handling for Promise.all or overall setup
       const errorMessage = `Error during parallel evaluation phase: ${error.message}`;
       Logger.error(`${colors.red}EVALUATE (Overall Error): ${errorMessage}${colors.reset}`, error);
       this.messages.push(new HumanMessage(errorMessage)); // Add error to main history
       this.currentState = 'Delay';
       this.evaluationTasks = []; // Ensure tasks are cleared even on error
       this.evaluationResults = []; // Clear results on error too
    }
  }

  private async update() {
    Logger.info(`${colors.dim}UPDATE: Processing ${this.evaluationResults.length} evaluation results...${colors.reset}`);

    if (this.evaluationResults.length === 0) {
      Logger.warn(`${colors.yellow}UPDATE: No evaluation results to process. Skipping.${colors.reset}`);
      this.currentState = 'Summary'; // Move to next state
      return;
    }

    // Process the results stored in this.evaluationResults
    // Example: Log the confidence levels
    for (const result of this.evaluationResults) {
       if ('parsed' in result) {
           Logger.info(`${colors.dim}UPDATE: Processing Market ${result.market}, Confidence: ${result.parsed.confidence}${colors.reset}`);
           // Placeholder: Add logic here to decide actions based on results (e.g., confidence > threshold)
           // This might involve calling write tools based on `result.market`, `result.parsed.answer`, etc.
       } else if ('error' in result) {
           Logger.error(`${colors.red}UPDATE: Skipping market ${result.market} due to evaluation error: ${result.error}${colors.reset}`);
       }
    }

    // Placeholder for actual update logic (e.g., calling write tools)
    Logger.info(`${colors.dim}UPDATE: Finished processing results. (Placeholder update logic)${colors.reset}`);

    // Clear the results after processing
    this.evaluationResults = [];
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