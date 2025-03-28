# Foil Agent Node Architecture

This directory contains the node implementations for the Foil trading agent.

## Architecture Overview

The agent is structured using a node-based architecture, where each node:
- Has a specific responsibility in the agent workflow
- Provides a unique prompt to the LLM
- Can execute tools and process their results
- Determines the next node to execute

The workflow is managed by the `GraphManager` which connects nodes together and handles transitions between them.

## Key Components

### BaseNode

The `BaseNode` class handles the common logic for all nodes:
- Model initialization and invocation
- Tool execution
- Response formatting
- State management

Nodes extend `BaseNode` and override methods as needed to customize behavior.

### Node Implementation

Each node must implement:
- `getPrompt(state)`: Returns the prompt string for the node
- `shouldContinue(state)`: Determines the next node to execute

Optionally, nodes can override:
- `processToolResults(state, agentResponse, toolResults)`: Custom processing of tool results
- `processResponse(state, response)`: Custom processing of regular AI responses

### Tools Node

The `ToolsNode` is a special node that handles tool execution. When a node uses a tool, the GraphManager will:
1. Execute the `ToolsNode`
2. Return control to the original node

## Creating a New Node

1. Create a new file in the `nodes` directory
2. Extend `BaseNode` and implement required methods
3. Register the node in the `GraphManager`

See `template.ts` for a reference implementation.

## Example: Creating a Node

```typescript
import { AIMessage } from "@langchain/core/messages";
import { AgentState, AgentConfig, AgentTools } from '../types';
import { BaseNode } from './base';

export class MyCustomNode extends BaseNode {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentTools
  ) {
    super(config, tools);
  }

  public getPrompt(state: AgentState): string {
    return `You are a custom node with a specific task.
    
    Your task is to analyze the data and provide insights.
    
    You have access to these tools:
    - tool_one: Description of tool one
    - tool_two: Description of tool two`;
  }

  async shouldContinue(state: AgentState): Promise<string> {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls?.length > 0) {
      return "tools";
    }
    
    // Go to the next node based on some condition
    return state.someCondition ? "next_node_a" : "next_node_b";
  }
}
```

## Using the Graph Manager

```typescript
// Initialize nodes
const nodeA = new NodeA(config, tools);
const nodeB = new NodeB(config, tools);
const toolsNode = new ToolsNode(config, tools);

// Register nodes with the graph manager
graphManager.registerNode('node_a', nodeA, ['node_b', 'tools']);
graphManager.registerNode('node_b', nodeB, ['end', 'tools']);
graphManager.registerToolsNode(toolsNode);

// Execute the graph
const finalState = await graphManager.execute('node_a', initialState);
``` 