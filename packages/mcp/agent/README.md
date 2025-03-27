# Foil Agent

A sophisticated trading agent for the Foil protocol that manages positions and discovers market opportunities.

## Directory Structure

```
packages/mcp/agent/
├── src/
│   ├── core/
│   │   ├── agent.ts           # Main agent class
│   │   ├── graph.ts           # Graph building and management
│   │   └── state.ts           # State management
│   ├── nodes/
│   │   ├── settle.ts          # Settlement node logic
│   │   ├── assess.ts          # Position assessment node
│   │   ├── discover.ts        # Market discovery node
│   │   └── summary.ts         # Summary generation node
│   ├── utils/
│   │   ├── logger.ts          # Logging utilities
│   │   ├── parser.ts          # Message parsing utilities
│   │   └── calculator.ts      # Position size and collateral calculations
│   └── types/
│       ├── index.ts           # Main types export
│       ├── agent.ts           # Agent-specific types
│       ├── market.ts          # Market-related types
│       └── position.ts        # Position-related types
├── index.ts                   # Main entry point
└── README.md                  # This file
```

## Components

### Core
- `agent.ts`: The main agent class that orchestrates the trading process
- `graph.ts`: Manages the state graph and node transitions
- `state.ts`: Handles state management and validation

### Nodes
- `settle.ts`: Handles position settlement logic
- `assess.ts`: Manages position assessment and modification
- `discover.ts`: Handles market discovery and opportunity analysis
- `summary.ts`: Generates trading session summaries

### Utils
- `logger.ts`: Provides logging functionality
- `parser.ts`: Handles message parsing and data extraction
- `calculator.ts`: Manages position size and collateral calculations

### Types
- `agent.ts`: Agent-specific type definitions
- `market.ts`: Market-related type definitions
- `position.ts`: Position-related type definitions

## Usage

```typescript
import { FoilAgent, AgentConfig, AgentTools } from '@foil/mcp/agent';

const config: AgentConfig = {
  interval: 60000, // 1 minute
  maxPositionsPerMarket: 5,
  minCollateral: "100000000000000000", // 0.1 ETH
  maxCollateral: "1000000000000000000", // 1 ETH
  targetLeverage: 2,
  openaiApiKey: "your-api-key"
};

const tools: AgentTools = {
  // ... your tools configuration
};

const agent = new FoilAgent(config, tools);
await agent.start();
```

## Features

- Automated position settlement
- Position assessment and modification
- Market discovery and opportunity analysis
- Comprehensive trading summaries
- Configurable trading intervals
- Robust error handling
- Detailed logging

## Development

The code is organized using a modular architecture with clear separation of concerns:

1. Each node handles a specific aspect of the trading process
2. The graph manager orchestrates node transitions
3. Utilities provide common functionality
4. Types ensure type safety throughout the codebase

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request 