import chalk from 'chalk';

export class Logger {
  private static isDebugMode = false;
  private static currentStep: string = '';

  private static readonly SKIP_PATTERNS = [
    '[llm/start]',
    'Entering LLM run',
    'chain:AgentExecutor',
    'chain:LLMChain',
    'llm:ChatAnthropic',
    'additional_kwargs',
    'response_metadata',
    'Current state messages:',
    'Message',
    'Content:',
    'Tool calls:',
    'Last message type:',
    'AGENT RESPONSE:',
    'Number of tool calls:',
    'Tool call'
  ];

  private static truncate(str: string, maxLength: number = 100) {
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }

  private static shouldSkipMessage(message: string): boolean {
    return this.SKIP_PATTERNS.some(pattern => message.includes(pattern));
  }

  static setDebugMode(enabled: boolean) {
    this.isDebugMode = enabled;
  }

  static info(message: string) {
    if (!this.shouldSkipMessage(message)) {
      console.log(chalk.blue(message));
    }
  }

  static nodeTransition(fromNode: string, toNode: string) {
    console.log(chalk.cyan(`SYSTEM: [${fromNode} -> ${toNode}]`));
  }

  static success(message: string) {
    if (!this.shouldSkipMessage(message)) {
      console.log(chalk.green(`✓ ${message}`));
    }
  }

  static warn(message: string) {
    if (!this.shouldSkipMessage(message)) {
      console.log(chalk.yellow(`⚠ ${message}`));
    }
  }

  static error(message: string) {
    console.log(chalk.red(`✖ ${message}`));
  }

  static step(message: string) {
    this.currentStep = message;
    if (!this.shouldSkipMessage(message)) {
      console.log(chalk.cyan(`SYSTEM: ${message}`));
    }
  }

  static debug(message: string) {
    if (this.isDebugMode && !this.shouldSkipMessage(message)) {
      console.log(chalk.gray(`🔍 ${message}`));
    }
  }

  static modelInteraction(messages: { role: string; content: any }[], prompt?: string) {
    messages.forEach(({ role, content }) => {
      if (role === 'human') {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        console.log(chalk.cyan(`SYSTEM: ${contentStr}`));
      } else if (role === 'assistant') {
        let assistantMessages: any[] = [];

        // Normalize content into an array of message parts
        if (typeof content === 'string') {
          if (content.trim().startsWith('[') && content.trim().endsWith(']')) {
            try {
              assistantMessages = JSON.parse(content);
            } catch (e) {
              assistantMessages = [{ type: 'text', text: content }];
            }
          } else {
            assistantMessages = [{ type: 'text', text: content }];
          }
        } else if (Array.isArray(content)) {
          assistantMessages = content;
        } else if (typeof content === 'object' && content !== null) {
           assistantMessages = [content];
        }

        // Process the normalized array
        assistantMessages.forEach(item => {
          if (typeof item === 'object' && item !== null) {
              if (item.type === 'text' && typeof item.text === 'string') {
                console.log(chalk.green(`AGENT: ${item.text}`));
              } else if (item.type === 'tool_use' && typeof item.name === 'string') {
                const args = typeof item.input === 'string' ? item.input : JSON.stringify(item.input);
                console.log(chalk.yellow(`Executing tool: ${item.name}(${args})`));
              } else if (typeof item.text === 'string') {
                 console.log(chalk.green(`AGENT: ${item.text}`));
              }
              // Ignore other object structures for now to avoid printing JSON
          } else if (typeof item === 'string') {
               console.log(chalk.green(`AGENT: ${item}`));
          }
        });
      }
    });
  }

  static toolCall(toolName: string, args: any, result?: any) {
    if (result !== undefined) {
      let output: string;
      try {
        const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
        output = JSON.stringify(parsedResult, null, 2); // Pretty print
      } catch (e) {
        output = typeof result === 'string' ? result : JSON.stringify(result);
      }
      console.log(chalk.magenta(`Tool Results: ${this.truncate(output, 200)}`)); // Truncate prettified output
    }
  }

  static stateUpdate(step: string, changes: Record<string, any>) {
    // Skip state update logs
  }
} 