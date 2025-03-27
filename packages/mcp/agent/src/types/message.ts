import { BaseMessage, SystemMessage, MessageContent } from "@langchain/core/messages";

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentMessage extends BaseMessage {
  type: string;
  tool_calls?: ToolCall[];
  content: MessageContent;
}

export class AgentSystemMessage extends SystemMessage implements AgentMessage {
  type: string = 'system';
  tool_calls?: ToolCall[];
} 