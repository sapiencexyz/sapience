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
    'response_metadata'
  ];

  private static truncate(str: string, maxLength: number = 100) {
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }

  private static shouldSkipMessage(msg: string): boolean {
    return this.SKIP_PATTERNS.some(pattern => msg.includes(pattern));
  }

  static setDebugMode(enabled: boolean) {
    this.isDebugMode = enabled;
  }

  static info(message: string) {
    if (!this.shouldSkipMessage(message)) {
      console.log(chalk.blue(`ℹ ${this.truncate(message)}`));
    }
  }

  static nodeTransition(fromNode: string, toNode: string) {
    console.log(chalk.cyan(`SYSTEM: [${fromNode} -> ${toNode}]`));
  }

  static success(message: string) {
    console.log(chalk.green(`✓ ${message}`));
  }

  static warn(message: string) {
    console.log(chalk.yellow(`⚠ ${message}`));
  }

  static error(message: string) {
    console.log(chalk.red(`✖ ${message}`));
  }

  static step(message: string) {
    this.currentStep = message;
    console.log(chalk.cyan(`SYSTEM: ${message}`));
  }

  static debug(message: string) {
    if (this.isDebugMode && !this.shouldSkipMessage(message)) {
      console.log(chalk.gray(`🔍 ${message}`));
    }
  }

  static modelInteraction(messages: { role: string; content: any }[], prompt?: string) {
    messages.forEach(({ role, content }) => {
      if (role === 'human') {
        const contentStr = typeof content === 'string' ? content :
                          Array.isArray(content) ? content.map(c => c.text).join('\n') :
                          JSON.stringify(content);
        console.log(chalk.blue(`PROMPT: ${this.truncate(contentStr)}`));
      } else if (role === 'assistant') {
        if (Array.isArray(content)) {
          console.log(chalk.green(`AGENT:`));
          content.forEach(item => {
            if (item.type === 'text') {
              console.log(chalk.green(`${this.truncate(item.text)}`));
            } else if (item.type === 'tool_use') {
              console.log(chalk.yellow(`[Tool: ${item.name}] ${this.truncate(JSON.stringify(item.input))}`));
            } else {
              console.log(chalk.green(`${this.truncate(JSON.stringify(item))}`));
            }
          });
        } else {
          const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
          console.log(chalk.green(`AGENT: ${this.truncate(contentStr)}`));
        }
      }
    });
  }

  static toolCall(toolName: string, args: any, result?: any) {
    const input = typeof args === 'string' ? args : JSON.stringify(args);
    const output = typeof result === 'string' ? result : JSON.stringify(result);
    
    console.log(chalk.magenta(`Tool input: ${this.truncate(input)}`));
    if (result !== undefined) {
      console.log(chalk.magenta(`Tool output: ${this.truncate(output)}`));
    }
  }

  static stateUpdate(step: string, changes: Record<string, any>) {
    if (step !== this.currentStep) {
      this.currentStep = step;
      console.log(chalk.cyan(`SYSTEM: ${step}`));
    }
  }
} 