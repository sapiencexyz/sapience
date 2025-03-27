import { BaseMessage, SystemMessage, MessageContent, MessageType, BaseMessageFields, AIMessage } from "@langchain/core/messages";
import { ToolCall } from "@langchain/core/dist/messages/tool";

export interface AgentMessage extends BaseMessage {
  type: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  content: MessageContent;
}

export class AgentSystemMessage extends SystemMessage implements AgentMessage {
  type: string = 'system';
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export class AgentAIMessage extends AIMessage implements AgentMessage {
  type: string = 'ai';
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  
  constructor(content: string | BaseMessageFields, tool_calls?: ToolCall[]) {
    super(content);
    this.tool_calls = tool_calls;
  }

  _getType(): MessageType {
    return 'ai' as MessageType;
  }
}

export class AgentToolMessage extends BaseMessage implements AgentMessage {
  type: string = 'tool';
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  content: MessageContent;
  
  constructor(content: string | BaseMessageFields, tool_call_id?: string) {
    super(content);
    this.tool_call_id = tool_call_id;
  }

  _getType(): MessageType {
    return 'tool' as MessageType;
  }
} 