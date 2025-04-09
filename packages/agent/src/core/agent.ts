import chalk from 'chalk';
import { AgentConfig, Tool } from '../types/index.js';
import { Logger } from '../utils/logger.js';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { Runnable } from '@langchain/core/runnables';
import { DynamicTool } from "@langchain/core/tools";
import { getSystemPrompt, getSummaryPrompt, getEvaluationPrompt } from './prompts.js';

// Define the states
type AgentState = 'Lookup' | 'Evaluate' | 'Update' | 'Execute' | 'Summary' | 'Delay';

// Define the collateral token
const COLLATERAL_WSTETH = '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452';

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
  private collateralToken: string;
  private tools: Record<string, Record<string, Tool>>;
  private flatTools: DynamicTool[];
  private agentAddress: string;
  private currentState: AgentState;
  private messages: BaseMessage[];
  private running: boolean;
  private isSingleRun: boolean; // Track if it's a single run
  private timeoutId: NodeJS.Timeout | null = null;
  private model: ChatAnthropic | ChatOllama;
  private modelWithTools: Runnable;
  private evaluationTasks: { market: any, question: string }[] = [];
  // Define the type for evaluation results explicitly for clarity
  private evaluationResults: ({ market: string; question: string; rawResponse: string; parsed: { answer: string; confidence: number; rationale: string; }; } | { market: string; question: string; error: string; })[] = [];

  // ---> Add these members to store data across steps <---
  private lastEvaluationResults: typeof this.evaluationResults = [];
  private lastFetchedPositions: any[] = [];
  private lastTotalCollateral: number = 0;
  private lastMarketUpdates: any[] = [];
  private lastMergeData: {
    positionsToClose: any[];
    positionsToUpdate: any[];
    positionsToOpen: any[];
  } = {
    positionsToClose: [],
    positionsToUpdate: [],
    positionsToOpen: []
  };
  private lastExecutionResult: any = null; // Store results from execute step
  // ---> End of added members <---

  constructor(config: AgentConfig, tools: Record<string, Record<string, Tool>>, agentAddress: string) {
    this.config = config;
    this.tools = tools;
    this.agentAddress = agentAddress;
    this.collateralToken = COLLATERAL_WSTETH;
    this.currentState = 'Lookup'; // Start with Lookup state
    this.running = false;
    this.isSingleRun = config.interval <= 0; // Determine if it's a single run at init

    // --- Model Initialization ---
    const useOllama = process.env.USE_OLLAMA === 'true';

    if (useOllama) {
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'; // Default Ollama URL
        const ollamaModelName = process.env.OLLAMA_MODEL_NAME || 'llama3.1'; // Default model
        Logger.info(chalk.yellow(`Using Ollama model: ${ollamaModelName} at ${ollamaBaseUrl}`));
        this.model = new ChatOllama({
            baseUrl: ollamaBaseUrl,
            model: ollamaModelName,
        });
    } else {
        if (!config.anthropicApiKey) {
            throw new Error('ANTHROPIC_API_KEY is required in the agent config when not using Ollama');
        }
        const anthropicModelName = config.anthropicModelName || 'claude-3-5-sonnet-20240620'; // Use from config or default
        Logger.info(chalk.yellow(`Using Anthropic model: ${anthropicModelName}`));
        this.model = new ChatAnthropic({ 
            apiKey: config.anthropicApiKey,
            modelName: anthropicModelName
        });
    }
    // --- End Model Initialization ---

    // Flatten tools using DynamicTool
    this.flatTools = Object.values(tools).flatMap(toolSet =>
        Object.values(toolSet).map(tool => new DynamicTool({
            name: tool.name,
            description: tool.description,
            func: tool.function
        }))
    );

    this.messages = []; // Initialize with empty messages

    // Bind tools to the model
    this.modelWithTools = this.model.bind({ tools: this.flatTools });

  }

  async start() {
    if (this.running) {
      Logger.warn('Agent is already running.');
      return;
    }
    this.running = true;
    Logger.info(chalk.bold('--- Agent Started ---'));
    // Reset state and messages for new start
    this.currentState = 'Lookup';
    this.messages = []; // Reset to empty messages
    // Log system message on start (using the function now)
    const systemPrompt = getSystemPrompt(this.agentAddress, this.flatTools.map(t => t.name));
    Logger.info(`${chalk.magenta('SYSTEM:')} ${systemPrompt}`);
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
    Logger.info(chalk.bold('--- Agent Stopped ---'));
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
          Logger.error(chalk.red(`Unknown state: ${this.currentState}`));
          this.stop(); // Stop on unknown state
          return;
      }
    } catch (error: any) {
      Logger.error(chalk.red(`Error during state ${previousState}: ${error.message}`), error);
      this.currentState = 'Delay';
    }

    // Logger.info(`--- Exiting State: ${previousState} ---`); // Reduced verbosity

    // Check if we should stop (single run and completed a cycle)
    if (this.isSingleRun && completedCycle) {
        this.running = false;
        Logger.info(chalk.bold('--- Agent finished single run cycle ---'));
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
    Logger.info(chalk.dim('LOOKUP: Fetching markets for evaluation...'));
    this.evaluationTasks = []; // Clear previous tasks

    const listMarketsTool = this.flatTools.find(t => t.name === 'listMarkets');

    if (!listMarketsTool) {
        Logger.error(chalk.red('LOOKUP: listMarkets tool not found.'));
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
        Logger.info(chalk.dim(`LOOKUP (Raw Result): ${typeof rawResultContent === 'string' ? rawResultContent : JSON.stringify(rawResultContent)}`));
        // ---> END LOGGING <---

        if (typeof marketsResult === 'string') { // <<< KEEP USING marketsResult here for initial check
            try {
                rawResultContent = JSON.parse(marketsResult); // Update rawResultContent if it was a string
            } catch (e) {
                Logger.error(chalk.red(`LOOKUP: Failed to parse listMarkets result string: ${marketsResult}`));
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
                 Logger.error(chalk.red(`LOOKUP: Failed to parse market array from tool result text: ${e.message}`));
                 this.currentState = 'Delay';
                 return;
             }
        } else if (Array.isArray(rawResultContent)) {
             markets = rawResultContent;
        } else {
            Logger.error(chalk.red(`LOOKUP: Unexpected structure in listMarkets result: ${JSON.stringify(rawResultContent)}`));
            this.currentState = 'Delay';
            return;
        }
        // --- End Result Parsing Logic ---


        if (!markets || markets.length === 0) {
             Logger.warn(chalk.yellow(`LOOKUP: No markets returned by listMarkets tool.`));
             this.currentState = 'Delay'; // Skip evaluation if no markets
             return;
        }

        Logger.info(chalk.dim(`LOOKUP: Preparing evaluation tasks for ${markets.length} epoch(s)...`));
        for (const epoch of markets) {
            const marketIdentifier = this.generateMarketIdentifier(epoch);
            const claimStatement = epoch.question;

            // Define the standard question for each market, ensuring claimStatement is included
            const question = getEvaluationPrompt(marketIdentifier, claimStatement); // USE PROMPT FUNCTION
            
            // Pass the epoch object and the generated question to the task
            this.evaluationTasks.push({ market: epoch, question: question });
        }

    } catch (error: any) {
        const errorMessage = `Error during Lookup/listMarkets: ${error.message}`;
        Logger.error(chalk.red(`LOOKUP: ${errorMessage}`), error);
        this.currentState = 'Delay';
    }
  }

  private async evaluate() {
    Logger.info(chalk.dim(`EVALUATE: Starting parallel market evaluation for ${this.evaluationTasks.length} task(s)...`));

    if (this.evaluationTasks.length === 0) {
      Logger.warn(chalk.yellow(`EVALUATE: No tasks prepared by Lookup step. Skipping evaluation.`));
      this.currentState = 'Update'; // Proceed to next step even if no tasks
      return;
    }

    try {
      const evaluationPromises = this.evaluationTasks.map(async (task) => {
        // Access marketAddress and epochId from the epoch object stored in task.market
        const marketIdentifier = this.generateMarketIdentifier(task.market);
        Logger.info(chalk.dim(`EVALUATE: Starting task for market: ${marketIdentifier}`));

        // Create a minimal message list for this specific task's context
        const systemPrompt = getSystemPrompt(this.agentAddress, this.flatTools.map(t => t.name)); // GENERATE SYSTEM PROMPT
        const taskMessages: BaseMessage[] = [
            new SystemMessage(systemPrompt), // PREPEND SYSTEM MESSAGE
            new HumanMessage(task.question) // The specific question for this market
        ];

        // Log the prompt being sent
        Logger.info(`${chalk.green('EVALUATE (Prompt):')} Market ${marketIdentifier}\n${task.question}`);

        try {
          // Use the base model, no tools needed for the structured answer
          const response = await this.model.invoke(taskMessages) as AIMessage;
          const responseContent = response.content && typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

          Logger.info(chalk.dim(`EVALUATE (Response): ${responseContent}`));

          // Basic parsing attempt
          const answerMatch = responseContent.match(/ANSWER:\s*([\s\S]*?)\s*CONFIDENCE:/);
          const confidenceMatch = responseContent.match(/CONFIDENCE:\s*(\d+)/);
          const rationaleMatch = responseContent.match(/RATIONALE:\s*([\s\S]*)/);

          Logger.info(chalk.dim(`EVALUATE (Answer): ${answerMatch ? answerMatch[1].trim() : 'Parsing Error'}`));
          Logger.info(chalk.dim(`EVALUATE (Confidence): ${confidenceMatch ? parseInt(confidenceMatch[1], 10) : -1}`));
          Logger.info(chalk.dim(`EVALUATE (Rationale): ${rationaleMatch ? rationaleMatch[1].trim() : 'Parsing Error'}`));

          const result = {
            market: marketIdentifier,
            fullMarket: task.market,
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
          Logger.info(`${chalk.blue('EVALUATE (Result):')} Market ${marketIdentifier}\n  Question (Claim): "${claimForLog}"\n  Answer: ${result.parsed.answer}\n  Confidence: ${result.parsed.confidence}\n  Rationale: ${result.parsed.rationale}`);
          return result;

        } catch (error: any) {
          const errorMessage = `Error evaluating market ${marketIdentifier}: ${error.message}`;
          Logger.error(chalk.red(`EVALUATE (Task Error): ${errorMessage}`), error);
          return { market: marketIdentifier, question: task.question, error: errorMessage }; // Store the correct identifier in error case
        }
      });

      // Wait for all parallel evaluations to complete
      const results = await Promise.all(evaluationPromises);

      Logger.info(chalk.dim(`EVALUATE: Finished all parallel tasks.`));

      // Store results for the update step
      this.evaluationResults = results;
      Logger.info(chalk.dim(`EVALUATE: Stored ${this.evaluationResults.length} results for Update step.`));

      // Clear tasks for the next cycle
      this.evaluationTasks = [];

    } catch (error: any) {
       // Error handling for Promise.all or overall setup
       const errorMessage = `Error during parallel evaluation phase: ${error.message}`;
       Logger.error(chalk.red(`EVALUATE (Overall Error): ${errorMessage}`), error);
       this.messages.push(new HumanMessage(errorMessage)); // Add error to main history
       this.currentState = 'Delay';
       this.evaluationTasks = []; // Ensure tasks are cleared even on error
       this.evaluationResults = []; // Clear results on error too
    }
  }

  private async update() {
    Logger.info(chalk.dim(`UPDATE: Processing ${this.evaluationResults.length} evaluation results...`));

    // Store evaluation results before clearing
    this.lastEvaluationResults = [...this.evaluationResults];

    if (this.evaluationResults.length === 0) {
      Logger.warn(chalk.yellow(`UPDATE: No evaluation results to process. Skipping.`));
      this.currentState = 'Execute'; // Go to Execute even if no results
      this.evaluationResults = []; // Clear results
      this.lastMarketUpdates = []; // Clear updates
      this.lastMergeData = {
        positionsToClose: [],
        positionsToUpdate: [],
        positionsToOpen: []
      };
      this.lastFetchedPositions = []; // Clear positions
      this.lastTotalCollateral = 0; // Clear collateral
      return;
    }

    // 1. Fetch current positions
    let currentPositions: any[] = []; // Placeholder for positions
    const getPositionsTool = this.flatTools.find(t => t.name === 'getPositions'); // FIX: Use correct tool name from logs

    // TODO: Fix getPositions tool to return market and chainId in the response as well
    if (getPositionsTool) {
      try {
        Logger.info(chalk.dim(`UPDATE: Fetching current positions for agent ${this.agentAddress}...`));
        const positionsResultRaw = await getPositionsTool.func(JSON.stringify({ owner: this.agentAddress }));
        Logger.info(chalk.dim(`UPDATE (Raw Positions Result): ${typeof positionsResultRaw === 'string' ? positionsResultRaw : JSON.stringify(positionsResultRaw)}`));

        // --- ADD: Parse positionsResult ---
        let parsedPositions: any[] = [];
        if (typeof positionsResultRaw === 'string') {
            try {
                parsedPositions = JSON.parse(positionsResultRaw);
            } catch (e) {
                 Logger.error(chalk.red(`UPDATE: Failed to parse positions result string: ${positionsResultRaw}`));
                 parsedPositions = []; // Keep empty on parse error
            }
        } else if (Array.isArray(positionsResultRaw)) {
             parsedPositions = positionsResultRaw;
        } else if (typeof positionsResultRaw === 'object' && positionsResultRaw !== null && Array.isArray(positionsResultRaw.content) && positionsResultRaw.content.length > 0 && positionsResultRaw.content[0].type === 'text') {
             try {
                 parsedPositions = JSON.parse(positionsResultRaw.content[0].text);
             } catch(e: any) {
                  Logger.error(chalk.red(`UPDATE: Failed to parse positions array from tool result text: ${e.message}`));
                  parsedPositions = [];
             }
        } else {
             Logger.warn(chalk.yellow(`UPDATE: Unexpected structure in positions result: ${JSON.stringify(positionsResultRaw)}`));
             parsedPositions = [];
        }

        if (!Array.isArray(parsedPositions)) {
            Logger.warn(chalk.yellow(`UPDATE: Parsed positions data is not an array. Using empty array.`));
            parsedPositions = [];
        }
        // --- END: Parse positionsResult ---

        // --- ADD: Filter for active positions (assuming collateralAmount > 0 means active) ---
        const activePositions = parsedPositions.filter(pos => pos && typeof pos.collateralAmount === 'number' && pos.collateralAmount > 0);
        Logger.info(chalk.dim(`UPDATE: Fetched ${parsedPositions.length} positions, found ${activePositions.length} active positions.`));
        // --- END: Filter ---

        this.lastFetchedPositions = activePositions.map(pos => ({
          ...pos,
          marketIdentifier: this.generateMarketIdentifier(pos)
        })); // Store FILTERED positions
      } catch (error: any) {
        Logger.error(chalk.red(`UPDATE: Error fetching or processing positions: ${error.message}`), error);
        this.lastFetchedPositions = []; // Clear on error
      }
    } else {
      Logger.warn(chalk.yellow(`UPDATE: getPositions tool not found. Proceeding without position data.`)); // FIX: Update log message
      this.lastFetchedPositions = [];
    }

    // 2. Fetch agent's collateral balance
    let collateralBalance = 0; // Placeholder
    const getBalanceTool = this.flatTools.find(t => t.name === 'getERC20BalanceOf'); // FIX: Use correct tool name from logs
    if (getBalanceTool) {
        try {
            Logger.info(chalk.dim(`UPDATE: Fetching collateral (${this.collateralToken}) balance for agent ${this.agentAddress}...`));
            const balanceResultRaw = await getBalanceTool.func(JSON.stringify({ tokenAddress: this.collateralToken, walletAddress: this.agentAddress }));
             Logger.info(chalk.dim(`UPDATE (Raw Balance Result): ${typeof balanceResultRaw === 'string' ? balanceResultRaw : JSON.stringify(balanceResultRaw)}`));

            // --- ADD: Parse balanceResult ---
             let parsedBalance = '0';
             if (typeof balanceResultRaw === 'string') {
                 try {
                     // Assuming the result is a simple number or an object containing the balance
                     const parsedJson = JSON.parse(balanceResultRaw);
                     if (typeof parsedJson === 'number') {
                         parsedBalance = parsedJson.toString();
                     } else if (typeof parsedJson === 'object' && parsedJson !== null && typeof parsedJson.balance === 'number') {
                         parsedBalance = parsedJson.balance;
                     } else if (typeof parsedJson === 'object' && parsedJson !== null && Array.isArray(parsedJson.content) && parsedJson.content.length > 0 && parsedJson.content[0].type === 'text') {
                         // Handle cases where the result might be wrapped, similar to listMarkets
                         try {
                             const innerParsed = JSON.parse(parsedJson.content[0].text);
                              if (typeof innerParsed === 'number') {
                                 parsedBalance = innerParsed.toString();
                             } else if (typeof innerParsed === 'object' && innerParsed !== null) {
                              if (typeof innerParsed.balance === 'string') {
                                parsedBalance = innerParsed.balance;
                              } else if (typeof innerParsed.balance === 'number') {
                                parsedBalance = innerParsed.balance.toString();
                              } else {
                                Logger.warn(chalk.yellow(`UPDATE: Unexpected inner structure in balance result text: ${parsedJson.content[0].text}`));
                              }
                             } else {
                                 Logger.warn(chalk.yellow(`UPDATE: Unexpected inner structure in balance result text: ${parsedJson.content[0].text}`));
                             }
                         } catch (e: any) {
                             Logger.error(chalk.red(`UPDATE: Failed to parse balance from tool result text: ${e.message}`));
                         }
                     } else {
                         Logger.warn(chalk.yellow(`UPDATE: Unexpected structure in parsed balance result JSON: ${balanceResultRaw}`));
                     }
                 } catch (e) {
                      Logger.error(chalk.red(`UPDATE: Failed to parse balance result string: ${balanceResultRaw}`));
                 }
             } else if (typeof balanceResultRaw === 'number') {
                parsedBalance = balanceResultRaw.toString();
             } else {
                  Logger.warn(chalk.yellow(`UPDATE: Unexpected type for balance result: ${typeof balanceResultRaw}`));
             }
            // --- END: Parse balanceResult ---

            collateralBalance = parseInt(parsedBalance, 10); // Convert parsedBalance to number TODO check if we need to use BigInt
            Logger.info(chalk.dim(`UPDATE: Successfully fetched and parsed collateral balance: ${collateralBalance}`));
        } catch (error: any) {
            Logger.error(chalk.red(`UPDATE: Error fetching or processing balance: ${error.message}`), error);
             collateralBalance = 0; // Reset on error
        }
    } else {
         Logger.warn(chalk.yellow(`UPDATE: getBalanceOf tool not found. Proceeding without balance data.`)); // FIX: Update log message
    }

    // 3. Calculate Total Collateral (Sum of balance and collateral in ACTIVE positions)
    // Use the filtered this.lastFetchedPositions
    const totalCollateralInPositions = this.lastFetchedPositions.reduce((sum, pos) => sum + (pos.collateralAmount || 0), 0);
    const totalAvailableCollateral = collateralBalance + totalCollateralInPositions;
    this.lastTotalCollateral = totalAvailableCollateral; // Store total collateral
    Logger.info(chalk.dim(`UPDATE: Agent Balance: ${collateralBalance}, Collateral in Active Positions: ${totalCollateralInPositions}, Total Available: ${totalAvailableCollateral}`));


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

    Logger.info(chalk.dim(`UPDATE: Total confidence sum for allocation: ${totalConfidence}`));

    for (const result of this.evaluationResults) {
       if ('parsed' in result && result.parsed.confidence >= 0) {
           const confidence = result.parsed.confidence;
           const marketIdentifier = result.market; // Use the identifier stored during evaluation

           // Calculate allocation fraction based on confidence
           const allocationFraction = totalConfidence > 0 ? confidence / totalConfidence : 0;
           const targetAllocation = totalAvailableCollateral * allocationFraction;

           // Determine target position (using the 'answer' string directly for now)
           const targetPosition = result.parsed.answer; // e.g., "YES", "NO", outcome description

           Logger.info(chalk.dim(`UPDATE: Market ${marketIdentifier} -> Confidence: ${confidence}, Target Allocation: ${targetAllocation.toFixed(2)}, Target Position: "${targetPosition}"`));

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
           Logger.error(chalk.red(`UPDATE: Skipping market ${result.market} due to evaluation error: ${result.error}`));
       } else {
           // Handle cases where confidence might be invalid (e.g., -1 from parsing error)
            Logger.warn(chalk.yellow(`UPDATE: Skipping market ${result.market} due to invalid confidence (${'parsed' in result ? result.parsed.confidence : 'N/A'}).`));
       }
    }

    // TODO: Add logic here to compare targetAllocation/targetPosition with currentPositions
    // and decide which transactions (e.g., deposit, withdraw, trade) are needed.
    // This will likely involve calling other tools (write tools).
    Logger.info(chalk.dim(`UPDATE: Calculated ${marketUpdates.length} potential market updates.`));
    this.lastMarketUpdates = marketUpdates; // Store calculated updates
    const mergeData = await this.getMergeData(this.lastMarketUpdates, this.lastFetchedPositions);
    this.lastMergeData = mergeData; // Store merge data


    // Placeholder for actual update logic (e.g., calling write tools based on marketUpdates)
    Logger.info(chalk.dim(`UPDATE: Finished processing results. (Placeholder - Actual contract interactions needed)`));

    // Clear the results after processing and storing
    this.evaluationResults = [];
    this.currentState = 'Execute'; // Move to Execute state
  }

  private async execute() {
    Logger.info(chalk.dim('EXECUTE: Signing and submitting transactions... (Placeholder)'));
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

    Logger.info(chalk.dim('EXECUTE: Finished transaction submission process. Stored placeholder results.'));
    this.currentState = 'Summary'; // Move to Summary state
  }

  private async summary() {
    Logger.info(chalk.dim('SUMMARY: Generating summary...'));

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

    const summaryPromptText = getSummaryPrompt(summaryContext); // USE PROMPT FUNCTION
    // const summaryPrompt = `Summarize the agent's recent activity based on the following information. Format the summary as a brief tweet thread (max 3 tweets, each max 280 chars). Output *only one*  JSON array of strings, where each string is a tweet. The tone should be sort of schizo, like a savant 20-year-old crypto trader who's been on drugs. No hashtags, can use punctation and capitalization sparingly, casual tone, etc.\n\nContext:\n${summaryContext}`;

    // Logger.info(chalk.cyan(`SUMMARY (Prompt):\n${summaryPromptText}`)); // Optional: uncomment to see the full prompt

    try {
        // Add the summary prompt to the message history temporarily for the call
        const systemPrompt = getSystemPrompt(this.agentAddress, this.flatTools.map(t => t.name)); // GENERATE SYSTEM PROMPT
        const summaryMessages: BaseMessage[] = [
            new SystemMessage(systemPrompt), // PREPEND SYSTEM MESSAGE
            // this.messages[0], // REMOVE OLD SYSTEM MESSAGE ACCESS
            // Potentially include a condensed history or just the prompt
            new HumanMessage(summaryPromptText)
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
            Logger.info(chalk.blue(`SUMMARY (Result): Generated ${tweetThread.length} tweets.`));
            // Log the generated tweets
            tweetThread.forEach((tweet, index) => {
                Logger.info(`${chalk.cyan(`Tweet ${index + 1}/${tweetThread.length}:`)} ${tweet}`);
            });
        } catch (parseError: any) {
            Logger.error(chalk.red(`SUMMARY: Failed to parse tweet thread JSON: ${parseError.message}. Raw response: ${responseContent}`));
            // Log the raw response if parsing fails
            Logger.warn(chalk.yellow(`SUMMARY Raw Response:\n${responseContent}`));
        }

        // Clear last cycle's data after summary is generated
        this.lastEvaluationResults = [];
        this.lastFetchedPositions = [];
        this.lastTotalCollateral = 0;
        this.lastMarketUpdates = [];
        this.lastExecutionResult = null;

        // TODO: Decide what to do with the tweetThread (e.g., log it, store it, etc.)

    } catch (error: any) {
        Logger.error(chalk.red(`SUMMARY: Error during LLM call for summary: ${error.message}`), error);
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
        Logger.info(chalk.dim(`DELAY: Waiting ${this.config.interval}ms...`));
    } else {
        // Logger.info(`DELAY: Interval is 0, proceeding immediately.`);
    }
  }

  private async getMergeData(expectedUpdates: any[], fetchedPositions: any[]): Promise<{
    positionsToClose: any[];
    positionsToUpdate: any[];
    positionsToOpen: any[];
  }> {
    // Initialize result object with categorized actions
    const mergeData = {
      positionsToClose: [] as any[],
      positionsToUpdate: [] as any[],
      positionsToOpen: [] as any[]
    };

    // From expectedUpdates, create a map of market identifiers and the current price of the market
    const marketPriceMap = new Map();
    for (const update of expectedUpdates) {
      const currentReferencePrice = await this.getMarketPrice(update.marketIdentifier);
      marketPriceMap.set(update.marketIdentifier, currentReferencePrice);
    }

    // Create a map of current positions by market identifier for easier lookup
    const currentPositionsMap = new Map();
    fetchedPositions.forEach(position => {
      if (position.marketAddress) {
        currentPositionsMap.set(position.marketAddress, position);
      }
    });

    // Process each expected update
    expectedUpdates.forEach(update => {
      const marketId = update.marketIdentifier;
      const targetPosition = update.targetPosition;
      const targetAllocation = update.targetAllocation;
      
      // Determine the expected position type based on the target position and market price
      const expectedPositionType = (targetPosition > marketPriceMap.get(marketId)) ? 'long' : 'short';

      // Check if we already have a position in this market
      const currentPosition = currentPositionsMap.get(marketId);
      
      if (!currentPosition) {
        // No current position exists, this is a new position to open
        if (targetAllocation > 0) {
          mergeData.positionsToOpen.push({
            marketId,
            positionType: expectedPositionType,
            targetPosition,
            targetAllocation,
            confidence: update.confidence,
            rationale: update.rationale
          });
        }
      } else {
        // We have an existing position, compare with target
        const currentAllocation = currentPosition.collateralAmount || 0;
        const currentPositionType = currentPosition.positionType || '';
        
        // Check if position type matches target position
        const positionTypeMatches = currentPositionType.toLowerCase() === targetPosition.toLowerCase();
        
        if (!positionTypeMatches) {
          // Position type doesn't match, we need to close the current position and open a new one
          mergeData.positionsToClose.push({
            marketId,
            currentPosition,
            reason: `Position type mismatch: current=${currentPositionType}, target=${targetPosition}`
          });
          
          if (targetAllocation > 0) {
            mergeData.positionsToOpen.push({
              marketId,
              targetPosition,
              targetAllocation,
              confidence: update.confidence,
              rationale: update.rationale
            });
          }
        } else {
          // Position type matches, check allocation
          if (targetAllocation === 0) {
            // Target allocation is zero, close the position
            mergeData.positionsToClose.push({
              marketId,
              currentPosition,
              reason: 'Target allocation is zero'
            });
          } else if (targetAllocation > currentAllocation) {
            // Need to increase position
            mergeData.positionsToUpdate.push({
              marketId,
              currentPosition,
              currentAllocation,
              targetAllocation,
              increaseAmount: targetAllocation - currentAllocation,
              confidence: update.confidence,
              rationale: update.rationale
            });
          } else if (targetAllocation < currentAllocation) {
            // Need to reduce position
            mergeData.positionsToUpdate.push({
              marketId,
              currentPosition,
              currentAllocation,
              targetAllocation,
              reduceAmount: currentAllocation - targetAllocation,
              confidence: update.confidence,
              rationale: update.rationale
            });
          }
          // If targetAllocation === currentAllocation, no action needed
        }
      }
    });
    
    // Check for positions that need to be closed (not in expected updates)
    currentPositionsMap.forEach((position, marketId) => {
      const isInExpectedUpdates = expectedUpdates.some(update => update.marketIdentifier === marketId);
      if (!isInExpectedUpdates) {
        mergeData.positionsToClose.push({
          marketId,
          currentPosition: position,
          reason: 'Position not in expected updates'
        });
      }
    });
    
    // Log summary of actions
    Logger.info(chalk.dim(`UPDATE: Action summary:
      - Positions to close: ${mergeData.positionsToClose.length}
      - Positions to update: ${mergeData.positionsToUpdate.length}
      - Positions to open: ${mergeData.positionsToOpen.length}
    `));
    
    return mergeData;
  }

  private generateMarketIdentifier(market: any): string {
    return market.marketAddress + (`-EpochID-${market.epochId}` || '-EpochID-Unknown_ID') + `-ChainID-${market.chainId}`;
  }

  private parseMarketIdentifier(marketIdentifier: string): {
    marketAddress: string;
    epochId: string;
    chainId: string;
  } {
    const [marketAddress, ,epochId, ,chainId] = marketIdentifier.split('-');
    return {
      marketAddress,
      epochId,
      chainId
    };
  }

  private async getMarketPrice(marketIdentifier: string): Promise<number> {
    const { marketAddress, epochId, chainId } = this.parseMarketIdentifier(marketIdentifier);

    const getMarketPriceTool = this.flatTools.find(t => t.name === 'getMarketReferencePrice'); // FIX: Use correct tool name from logs

    if (getMarketPriceTool) {
      try {
        Logger.info(chalk.dim(`HELPER: Fetching current market price for ${marketIdentifier}...`));
        const marketPriceResultRaw = await getMarketPriceTool.func(JSON.stringify({ marketAddress, epochId, chainId }));
        Logger.info(chalk.dim(`HELPER (Raw Market Price Result): ${typeof marketPriceResultRaw === 'string' ? marketPriceResultRaw : JSON.stringify(marketPriceResultRaw)}`));

        // --- ADD: Parse marketPriceResult ---
        let parsedMarketPrice: number = 0;
        if (typeof marketPriceResultRaw === 'string') {
            try {
                parsedMarketPrice = JSON.parse(marketPriceResultRaw);
            } catch (e) {
                 Logger.error(chalk.red(`HELPER: Failed to parse market price result string: ${marketPriceResultRaw}`));
                 parsedMarketPrice = 0; // Keep empty on parse error
            }
        } else if (Array.isArray(marketPriceResultRaw) && marketPriceResultRaw.length > 0) {
             parsedMarketPrice = marketPriceResultRaw[0];
        } else if (typeof marketPriceResultRaw === 'object' && marketPriceResultRaw !== null && Array.isArray(marketPriceResultRaw.content) && marketPriceResultRaw.content.length > 0 && marketPriceResultRaw.content[0].type === 'text') {
             try {
                 parsedMarketPrice = JSON.parse(marketPriceResultRaw.content[0].text);
             } catch(e: any) {
                  Logger.error(chalk.red(`HELPER: Failed to parse market price from tool result text: ${e.message}`));
                  parsedMarketPrice = 0;
             }
        } else {
             Logger.warn(chalk.yellow(`HELPER: Unexpected structure in market price result: ${JSON.stringify(marketPriceResultRaw)}`));
             parsedMarketPrice = 0;
        }
        // --- END: Parse marketPriceResult ---

        Logger.info(chalk.dim(`HELPER: Parsed market price: ${JSON.stringify(parsedMarketPrice) }`));
        return parsedMarketPrice;
      } catch (error: any) {
        Logger.error(chalk.red(`HELPER: Error fetching or processing market price: ${error.message}`), error);
        return -1; // Clear on error
      }
    } else {
      Logger.warn(chalk.yellow(`HELPER: getMarketPrice tool not found. Proceeding with 0.`)); // FIX: Update log message
      return -1;
    }
  }
}