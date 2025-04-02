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
type AgentState = 'Lookup' | 'Evaluate' | 'Update' | 'Execute' | 'Summary' | 'Delay';

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

  // ---> Add these members to store data across steps <---
  private lastEvaluationResults: typeof this.evaluationResults = [];
  private lastFetchedPositions: any[] = [];
  private lastTotalCollateral: number = 0;
  private lastMarketUpdates: any[] = [];
  private lastExecutionResult: any = null; // Store results from execute step
  // ---> End of added members <---

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
          // Store necessary data from update for execute/summary if needed
          // e.g., this.transactionsToExecute = marketUpdates;
          this.currentState = 'Execute'; // Go to Execute next
          break;
        case 'Execute': // New Execute state
          await this.execute();
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
          case 'Execute': return 'Update';
          case 'Summary': return 'Execute';
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
        let rawResultContent = marketsResult; // <<< MOVED DECLARATION HERE

        // ---> ADD LOGGING HERE <---
        Logger.info(`${colors.dim}LOOKUP (Raw Result): ${typeof rawResultContent === 'string' ? rawResultContent : JSON.stringify(rawResultContent)}${colors.reset}`);
        // ---> END LOGGING <---

        if (typeof marketsResult === 'string') { // <<< KEEP USING marketsResult here for initial check
            try {
                rawResultContent = JSON.parse(marketsResult); // Update rawResultContent if it was a string
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
          const answerMatch = responseContent.match(/ANSWER:\s*([\s\S]*?)\s*CONFIDENCE:/);
          const confidenceMatch = responseContent.match(/CONFIDENCE:\s*(\d+)/);
          const rationaleMatch = responseContent.match(/RATIONALE:\s*([\s\S]*)/);

          const result = {
            market: marketIdentifier,
            question: task.question, // Keep the full question in the result object
            rawResponse: responseContent,
            parsed: {
              answer: answerMatch ? answerMatch[1].trim() : 'Parsing Error',
              confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : -1,
              rationale: rationaleMatch ? rationaleMatch[1].trim() : 'Parsing Error'
            }
          };
          // Extract claim for logging
          const claimForLog = task.market.question || 'N/A'; 
          Logger.info(`${colors.blue}EVALUATE (Result):${colors.reset} Market ${marketIdentifier}\n  Question (Claim): "${claimForLog}"\n  Answer: ${result.parsed.answer}\n  Confidence: ${result.parsed.confidence}\n  Rationale: ${result.parsed.rationale}`);
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

    // Store evaluation results before clearing
    this.lastEvaluationResults = [...this.evaluationResults];

    if (this.evaluationResults.length === 0) {
      Logger.warn(`${colors.yellow}UPDATE: No evaluation results to process. Skipping.${colors.reset}`);
      this.currentState = 'Execute'; // Go to Execute even if no results
      this.evaluationResults = []; // Clear results
      this.lastMarketUpdates = []; // Clear updates
      this.lastFetchedPositions = []; // Clear positions
      this.lastTotalCollateral = 0; // Clear collateral
      return;
    }

    // 1. Fetch current positions
    let currentPositions: any[] = []; // Placeholder for positions
    const getPositionsTool = this.flatTools.find(t => t.name === 'getPositionsByOwner'); // Assuming tool name
    if (getPositionsTool) {
      try {
        Logger.info(`${colors.dim}UPDATE: Fetching current positions for agent ${this.agentAddress}...${colors.reset}`);
        // TODO: Define the structure needed for the input args (e.g., { owner: this.agentAddress })
        const positionsResult = await getPositionsTool.func(JSON.stringify({ owner: this.agentAddress }));
        // TODO: Parse positionsResult similar to how listMarkets is parsed in lookup()
        // currentPositions = parsedPositions; // Assign parsed results
        this.lastFetchedPositions = currentPositions; // Store fetched positions
        Logger.info(`${colors.dim}UPDATE: Successfully fetched positions. (Result needs parsing)${colors.reset}`);
      } catch (error: any) {
        Logger.error(`${colors.red}UPDATE: Error fetching positions: ${error.message}${colors.reset}`, error);
        // Decide how to handle this - maybe proceed without position data or delay?
        this.lastFetchedPositions = []; // Clear on error
      }
    } else {
      Logger.warn(`${colors.yellow}UPDATE: getPositionsByOwner tool not found. Proceeding without position data.${colors.reset}`);
      this.lastFetchedPositions = [];
    }

    // 2. Fetch agent's collateral balance (Example)
    let collateralBalance = 0; // Placeholder
    const getBalanceTool = this.flatTools.find(t => t.name === 'getCollateralBalance'); // Assuming tool name
    if (getBalanceTool) {
        try {
            Logger.info(`${colors.dim}UPDATE: Fetching collateral balance for agent ${this.agentAddress}...${colors.reset}`);
            // TODO: Define input args if needed (e.g., { owner: this.agentAddress, token: 'USDC' })
            const balanceResult = await getBalanceTool.func(JSON.stringify({ owner: this.agentAddress }));
            // TODO: Parse balanceResult
            // collateralBalance = parsedBalance;
             Logger.info(`${colors.dim}UPDATE: Successfully fetched collateral balance. (Result needs parsing)${colors.reset}`);
        } catch (error: any) {
            Logger.error(`${colors.red}UPDATE: Error fetching balance: ${error.message}${colors.reset}`, error);
        }
    } else {
         Logger.warn(`${colors.yellow}UPDATE: getCollateralBalance tool not found. Proceeding without balance data.${colors.reset}`);
    }

    // 3. Calculate Total Collateral (Example: Sum of balance and collateral in positions)
    // TODO: Refine this based on actual position data structure (using lastFetchedPositions)
    const totalCollateralInPositions = this.lastFetchedPositions.reduce((sum, pos) => sum + (pos.collateralAmount || 0), 0);
    const totalAvailableCollateral = collateralBalance + totalCollateralInPositions;
    this.lastTotalCollateral = totalAvailableCollateral; // Store total collateral
    Logger.info(`${colors.dim}UPDATE: Total available collateral estimated at ${totalAvailableCollateral}${colors.reset}`);


    // 4. Calculate Target Allocations and Positions
    const marketUpdates = [];
    let totalConfidence = 0;
    const validResults = this.evaluationResults.filter(r => 'parsed' in r && r.parsed.confidence >= 0);

    // Sum total confidence for normalization
    validResults.forEach(result => {
        if ('parsed' in result) { // Type guard
           totalConfidence += result.parsed.confidence;
        }
    });

    Logger.info(`${colors.dim}UPDATE: Total confidence sum for allocation: ${totalConfidence}${colors.reset}`);

    for (const result of this.evaluationResults) {
       if ('parsed' in result && result.parsed.confidence >= 0) {
           const confidence = result.parsed.confidence;
           const marketIdentifier = result.market; // Use the identifier stored during evaluation

           // Calculate allocation fraction based on confidence
           const allocationFraction = totalConfidence > 0 ? confidence / totalConfidence : 0;
           const targetAllocation = totalAvailableCollateral * allocationFraction;

           // Determine target position (using the 'answer' string directly for now)
           const targetPosition = result.parsed.answer; // e.g., "YES", "NO", outcome description

           Logger.info(`${colors.dim}UPDATE: Market ${marketIdentifier} -> Confidence: ${confidence}, Target Allocation: ${targetAllocation.toFixed(2)}, Target Position: "${targetPosition}"${colors.reset}`);

           // Store the calculated update information
           marketUpdates.push({
               marketIdentifier,
               targetAllocation,
               targetPosition,
               confidence,
               rationale: result.parsed.rationale // Keep rationale for context
           });

           // Placeholder: Add logic here to decide actions based on results (e.g., confidence > threshold)
           // This might involve calling write tools based on `result.market`, `result.parsed.answer`, etc.

       } else if ('error' in result) {
           Logger.error(`${colors.red}UPDATE: Skipping market ${result.market} due to evaluation error: ${result.error}${colors.reset}`);
       } else {
           // Handle cases where confidence might be invalid (e.g., -1 from parsing error)
            Logger.warn(`${colors.yellow}UPDATE: Skipping market ${result.market} due to invalid confidence (${'parsed' in result ? result.parsed.confidence : 'N/A'}).${colors.reset}`);
       }
    }

    // TODO: Add logic here to compare targetAllocation/targetPosition with currentPositions
    // and decide which transactions (e.g., deposit, withdraw, trade) are needed.
    // This will likely involve calling other tools (write tools).
    Logger.info(`${colors.dim}UPDATE: Calculated ${marketUpdates.length} potential market updates.${colors.reset}`);
    this.lastMarketUpdates = marketUpdates; // Store calculated updates


    // Placeholder for actual update logic (e.g., calling write tools based on marketUpdates)
    Logger.info(`${colors.dim}UPDATE: Finished processing results. (Placeholder - Actual contract interactions needed)${colors.reset}`);

    // Clear the results after processing and storing
    this.evaluationResults = [];
    this.currentState = 'Execute'; // Move to Execute state
  }

  private async execute() {
    Logger.info(`${colors.dim}EXECUTE: Signing and submitting transactions... (Placeholder)${colors.reset}`);
    // TODO: Retrieve the transactions/actions determined in the Update step (using this.lastMarketUpdates and this.lastFetchedPositions).
    // TODO: Implement logic to sign transactions using the agent's private key.
    // TODO: Implement logic to submit transactions to the blockchain.
    // TODO: Handle transaction results (success/failure).

    // Placeholder for execution results
    this.lastExecutionResult = {
        success: true, // Assume success for now
        transactionsAttempted: this.lastMarketUpdates.length, // Example: number of potential updates
        transactionsSubmitted: 0, // TODO: Update this based on actual submissions
        errors: [], // TODO: Populate with any errors during execution
    };

    Logger.info(`${colors.dim}EXECUTE: Finished transaction submission process. Stored placeholder results.${colors.reset}`);
    this.currentState = 'Summary'; // Move to Summary state
  }

  private async summary() {
    Logger.info(`${colors.dim}SUMMARY: Generating summary...${colors.reset}`);

    // Gather context for the summary using the persisted data
    const evaluatedCount = this.lastEvaluationResults.length;
    const successfulEvaluations = this.lastEvaluationResults.filter(r => 'parsed' in r).length;
    const errorEvaluations = evaluatedCount - successfulEvaluations;
    const updatesCalculated = this.lastMarketUpdates.length;
    const executionStatus = this.lastExecutionResult?.success ? 'successful' : 'failed';
    const txAttempted = this.lastExecutionResult?.transactionsAttempted ?? 0;
    const txSubmitted = this.lastExecutionResult?.transactionsSubmitted ?? 0;
    const executionErrors = this.lastExecutionResult?.errors?.length ?? 0;

    // Construct a more detailed context string
    let summaryContext = `Cycle Summary:
- Evaluated ${evaluatedCount} markets (${successfulEvaluations} successful, ${errorEvaluations} errors).
- Current Positions Fetched: ${this.lastFetchedPositions.length > 0 ? 'Yes' : 'No/Error'} (Count: ${this.lastFetchedPositions.length}).
- Total Collateral Estimated: ${this.lastTotalCollateral.toFixed(2)}.
- Calculated ${updatesCalculated} target market updates/allocations.
- Execution step was ${executionStatus}.
- Transactions Attempted: ${txAttempted}.
- Transactions Submitted: ${txSubmitted}.
- Execution Errors: ${executionErrors}.
`;

    // Add details from market updates if available
    if (updatesCalculated > 0) {
        summaryContext += "\nTarget Updates:\n";
        this.lastMarketUpdates.slice(0, 5).forEach(upd => { // Limit details for brevity
            summaryContext += `- Mkt: ${upd.marketIdentifier}, Pos: "${upd.targetPosition}", Alloc: ${upd.targetAllocation.toFixed(2)}, Conf: ${upd.confidence}\n`;
        });
        if (updatesCalculated > 5) {
            summaryContext += `- ... and ${updatesCalculated - 5} more.\n`;
        }
    }


    const summaryPrompt = `Summarize the agent's recent activity based on the following information. Format the summary as a brief tweet thread (max 3 tweets, each max 280 chars). Output *only* a JSON array of strings, where each string is a tweet. The tone should be cool crypto bro but not too on-the-nose. No hashtags, can use punctation and capitalization sparingly, casual tone, etc.\n\nContext:\n${summaryContext}`;

    // Logger.info(`${colors.cyan}SUMMARY (Prompt):${colors.reset}\n${summaryPrompt}`); // Optional: uncomment to see the full prompt

    try {
        // Add the summary prompt to the message history temporarily for the call
        const summaryMessages: BaseMessage[] = [
            this.messages[0], // System message
            // Potentially include a condensed history or just the prompt
            new HumanMessage(summaryPrompt)
        ];

        // Use the base model for summarization
        const response = await this.model.invoke(summaryMessages) as AIMessage;
        const responseContent = response.content && typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

        // Attempt to parse the response as a JSON array of strings
        let tweetThread: string[] = [];
        try {
            tweetThread = JSON.parse(responseContent);
            if (!Array.isArray(tweetThread) || !tweetThread.every(item => typeof item === 'string')) {
                throw new Error('Parsed result is not an array of strings.');
            }
            Logger.info(`${colors.blue}SUMMARY (Result):${colors.reset} Generated ${tweetThread.length} tweets.`);
            // Log the generated tweets
            tweetThread.forEach((tweet, index) => {
                Logger.info(`${colors.cyan}Tweet ${index + 1}/${tweetThread.length}:${colors.reset} ${tweet}`);
            });
        } catch (parseError: any) {
            Logger.error(`${colors.red}SUMMARY: Failed to parse tweet thread JSON: ${parseError.message}${colors.reset}. Raw response: ${responseContent}`);
            // Log the raw response if parsing fails
            Logger.warn(`${colors.yellow}SUMMARY Raw Response:${colors.reset}\n${responseContent}`);
        }

        // Clear last cycle's data after summary is generated
        this.lastEvaluationResults = [];
        this.lastFetchedPositions = [];
        this.lastTotalCollateral = 0;
        this.lastMarketUpdates = [];
        this.lastExecutionResult = null;

        // TODO: Decide what to do with the tweetThread (e.g., log it, store it, etc.)

    } catch (error: any) {
        Logger.error(`${colors.red}SUMMARY: Error during LLM call for summary: ${error.message}${colors.reset}`, error);
         // Clear potentially partial data on error
        this.lastEvaluationResults = [];
        this.lastFetchedPositions = [];
        this.lastTotalCollateral = 0;
        this.lastMarketUpdates = [];
        this.lastExecutionResult = null;
    }

    // Logger.info(`SUMMARY: Final message count: ${this.messages.length}`);
    this.currentState = 'Delay'; // Move to Delay state
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