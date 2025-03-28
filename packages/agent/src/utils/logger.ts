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
    if (!msgStr.includes('[llm/start]') && !msgStr.includes('[chain/start]')) {
      console.log(chalk.blue('ℹ'), chalk.blue(msgStr));
    }
  }

  static success(msg: string) {
    console.log(chalk.green('✓'), chalk.green(msg));
  }

  static warn(msg: string) {
    console.log(chalk.yellow('⚠'), chalk.yellow(msg));
  }

  static error(msg: string) {
    console.log(chalk.red('✖'), chalk.red(msg));
  }

  static step(msg: string) {
    this.currentStep = msg;
    console.log(chalk.cyan(`[${msg}]`));
  }

  static debug(msg: string) {
    if (this.isDebugMode) {
      console.log(chalk.gray('🔍'), chalk.gray(msg));
    }
  }

  static modelInteraction(messages: { role: string; content: any }[], prompt?: string) {
    // Show human and assistant messages
    messages.forEach(({ role, content }) => {
      if (role === 'human') {
        const contentStr = typeof content === 'string' ? content :
                          Array.isArray(content) ? content.map(c => c.text).join('\n') :
                          JSON.stringify(content);
        console.log(chalk.blue('HUMAN:'), chalk.blue(contentStr));
      } else if (role === 'assistant') {
        const contentStr = typeof content === 'string' ? content :
                          Array.isArray(content) ? content.map(c => c.text).join('\n') :
                          JSON.stringify(content);
        console.log(chalk.green('AGENT:'), chalk.green(contentStr));
      }
    });
  }

  static toolCall(toolName: string, args: any, result?: any) {
    console.log(chalk.magenta(`Calling ${toolName}`));
    if (result !== undefined) {
      console.log(chalk.magenta('Output:'), typeof result === 'string' ? result : JSON.stringify(result));
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