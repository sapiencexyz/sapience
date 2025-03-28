import chalk from 'chalk';

export class Logger {
  private static isDebugMode = false;
  private static currentStep: string = '';

  private static shouldSkipMessage(msg: string): boolean {
    return msg.includes('[llm/start]') || 
           msg.includes('Entering LLM run') ||
           msg.includes('chain:AgentExecutor') ||
           msg.includes('chain:LLMChain') ||
           msg.includes('llm:ChatAnthropic') ||
           msg.includes('additional_kwargs') ||
           msg.includes('response_metadata');
  }

  static setDebugMode(enabled: boolean) {
    this.isDebugMode = enabled;
  }

  static info(msg: string | string[]) {
    const msgStr = Array.isArray(msg) ? msg.join('\n') : msg;
    if (this.shouldSkipMessage(msgStr)) return;
    console.log(chalk.blue('ℹ'), chalk.blue(msgStr));
  }

  static success(msg: string) {
    if (this.shouldSkipMessage(msg)) return;
    console.log(chalk.green('✓'), chalk.green(msg));
  }

  static warn(msg: string) {
    if (this.shouldSkipMessage(msg)) return;
    console.log(chalk.yellow('⚠'), chalk.yellow(msg));
  }

  static error(msg: string) {
    if (this.shouldSkipMessage(msg)) return;
    console.log(chalk.red('✖'), chalk.red(msg));
  }

  static step(msg: string) {
    this.currentStep = msg;
    console.log(chalk.cyan(`[${msg}]`));
  }

  static debug(msg: string) {
    if (this.isDebugMode && !this.shouldSkipMessage(msg)) {
      console.log(chalk.gray('🔍'), chalk.gray(msg));
    }
  }

  static modelInteraction(messages: { role: string; content: any }[], prompt?: string) {
    // Skip if it's just a LangChain debug message
    if (messages.length === 1 && messages[0].role === 'system' && 
        (messages[0].content.includes('[llm/start]') || messages[0].content.includes('Entering LLM run'))) {
      return;
    }

    // Show each message with its role
    messages.forEach(({ role, content }) => {
      if (role === 'system') {
        const contentStr = typeof content === 'string' ? content :
                          Array.isArray(content) ? content.map(c => c.text).join('\n') :
                          JSON.stringify(content);
        if (!this.shouldSkipMessage(contentStr)) {
          console.log(chalk.magenta('System:'), chalk.magenta(contentStr));
        }
      } else if (role === 'human') {
        const contentStr = typeof content === 'string' ? content :
                          Array.isArray(content) ? content.map(c => c.text).join('\n') :
                          JSON.stringify(content);
        if (!this.shouldSkipMessage(contentStr)) {
          console.log(chalk.blue('Human:'), chalk.blue(contentStr));
        }
      } else if (role === 'assistant') {
        const contentStr = typeof content === 'string' ? content :
                          Array.isArray(content) ? content.map(c => c.text).join('\n') :
                          JSON.stringify(content);
        if (!this.shouldSkipMessage(contentStr)) {
          console.log(chalk.green('Agent:'), chalk.green(contentStr));
        }
      }
    });
  }

  static toolCall(toolName: string, args: any, result?: any) {
    console.log(chalk.yellow(`Calling tool with ${toolName}`));
    if (result !== undefined) {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      if (!this.shouldSkipMessage(resultStr)) {
        console.log(chalk.yellow('Received tool output:'), resultStr);
      }
    }
  }

  static stateUpdate(step: string, changes: Record<string, any>) {
    // Only show the step name if it's different from current step
    if (step !== this.currentStep) {
      this.currentStep = step;
      console.log(chalk.cyan(`[${step}]`));
    }
  }
} 