import { Position, Market } from '../types';

export class MessageParser {
  static parsePositionsFromMessages(messages: any[]): Position[] {
    return messages
      .filter(m => m.content.includes("Position:"))
      .map(m => {
        try {
          const positionData = JSON.parse(m.content.split("Position:")[1]);
          return positionData as Position;
        } catch {
          return null;
        }
      })
      .filter((p): p is Position => p !== null);
  }

  static parseMarketsFromMessages(messages: any[]): Market[] {
    return messages
      .filter(m => m.content.includes("Market:"))
      .map(m => {
        try {
          const marketData = JSON.parse(m.content.split("Market:")[1]);
          return marketData as Market;
        } catch {
          return null;
        }
      })
      .filter((m): m is Market => m !== null);
  }
} 