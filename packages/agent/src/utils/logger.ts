export class Logger {
  static info(message: string, ...optionalParams: any[]) {
    console.log(`[INFO] ${message}`, ...optionalParams);
  }

  static warn(message: string, ...optionalParams: any[]) {
    console.warn(`[WARN] ${message}`, ...optionalParams);
  }

  static error(message: string, ...optionalParams: any[]) {
    console.error(`[ERROR] ${message}`, ...optionalParams);
  }
} 