export class Logger {
  static info(message: string, ...optionalParams: any[]) {
    console.log();
    console.log(message, ...optionalParams);
  }

  static warn(message: string, ...optionalParams: any[]) {
    console.log();
    console.warn(message, ...optionalParams);
  }

  static error(message: string, ...optionalParams: any[]) {
    console.log();
    console.error(message, ...optionalParams);
  }
} 