import chalk from 'chalk';

export class Logger {
  static info(msg: string | string[]) {
    const msgStr = Array.isArray(msg) ? msg.join('\n') : msg;
    console.log(chalk.blue('ℹ'), chalk.blue(msgStr));
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
    console.log(chalk.cyan('→'), chalk.cyan(msg));
  }

  static messageBlock(messages: { role: string; content: any }[]) {
    messages.forEach(({ role, content }) => {
      const roleColor = role === 'system' ? chalk.magenta : 
                       role === 'agent' ? chalk.green : 
                       chalk.blue;
      const contentStr = typeof content === 'string' ? content :
                        Array.isArray(content) ? content.map(c => c.text).join('\n') :
                        JSON.stringify(content, null, 2);
      console.log(
        roleColor(`${role.toUpperCase()}:`),
        contentStr.split('\n').map(line => '  ' + line).join('\n')
      );
    });
  }
} 