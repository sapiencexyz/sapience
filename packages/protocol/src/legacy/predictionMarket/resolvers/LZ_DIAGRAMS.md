# Prediction Market LayerZero Resolver Diagrams

This document contains interaction diagrams for the LayerZero-based PredictionMarket Resolvers.

## System Architecture

### System Overview
```mermaid
graph TB
    subgraph "Prediction Market Network"
        PM[Prediction Market Contract]
        PMR[PredictionMarketLZResolver]
        LZ1[LayerZero Endpoint]
    end
    
    subgraph "UMA Network"
        UMA[UMA Optimistic Oracle V3]
        UMR[PredictionMarketLZResolverUmaSide]
        LZ2[LayerZero Endpoint]
        Bonds[Bond Management]
        ETH[LZ Eth fee Management]
    end
    
    User[User/Asserter] -->|submitAssertion| UMR
    UMR -->|manage bonds| Bonds
    UMR -->|manage lz fee| ETH
    UMR -->|assertTruth| UMA
    UMA -->|callback| UMR
    UMR -->|LayerZero Message| LZ2
    LZ2 -.->|Cross-chain| LZ1
    LZ1 -->|LayerZero Message| PMR
    PMR -->|update state| PM
    PM -->|check resolution| PMR
```

### System Flow
```mermaid
sequenceDiagram
    participant User
    participant UMR as UMA Resolver
    participant Bonds as Bond Management
    participant Eth as Eth Management
    participant UMA as UMA Optimistic Oracle V3
    participant LZ2 as LayerZero (UMA Side)
    participant LZ1 as LayerZero (PM Side)
    participant PMR as Prediction Market Resolver
    participant PM as Prediction Market
    
    User->>UMR: submitAssertion(claim, endTime, resolvedToYes)
    
    Note over UMR: Check ERC20 balance for bondCurrency
    UMR->>UMA: assertTruth(claim, asserter, ...)
    
    UMA-->>UMR: assertionResolvedCallback()
    alt assertedTruthfully == true
        UMR->>LZ2: CMD_FROM_UMA_MARKET_RESOLVED
    else assertedTruthfully == false
        UMR->>UMR: Emit MarketResolvedFromUMA (no LZ message)
    end
    LZ2-->>LZ1: Cross-chain message (eth fee)
    LZ1->>PMR: _lzReceive()
    
    PMR->>PMR: marketResolvedCallback()
    PMR->>PM: Update market state
    
    PM->>PMR: getPredictionResolution()
    PMR-->>PM: Return resolution status
```

## Message Flow

### System Messages
```mermaid
graph LR
    subgraph "UMA → Prediction Market"
        A[CMD_FROM_UMA_MARKET_RESOLVED]
    end
    
    Note1[No messages from PM to UMA]
    Note2[LZ only on truthful resolutions]
```

## State Management

### System State Flow
```mermaid
stateDiagram-v2
    [*] --> UMASubmission: submitAssertion() on UMA side
    UMASubmission --> UMAProcessing: UMA receives assertion
    UMAProcessing --> Resolved: UMA resolves
    UMAProcessing --> Disputed: UMA disputes
    Resolved --> [*]
    Disputed --> UMASubmission: Can resubmit
```

## Bond Management

### Bond Flow
```mermaid
graph TD
    User[User] -->|Deposit Bond| UMR[UMA Resolver]
    UMR -->|Store Bond| Bonds[Bond Management]
    UMR -->|Use Bond| UMA[UMA Optimistic Oracle V3]
    UMA -->|Return Bond| UMR
    UMR -->|Store Bond| Bonds
    User -->|Withdraw Bond| UMR
    UMR -->|Return Bond| User
```

## ETH Management

### ETH Flow
```mermaid
graph TD
    User[User] -->|Deposit Eth| UMR[UMA Resolver]
    UMR -->|Use Eth| LZ[LZ Cross Chain]
    User -->|Withdraw Eth| UMR
    UMR -->|Return Eth| User
```

## Deployment Architecture

### System Deployment
```mermaid
graph TB
    subgraph "Prediction Market Network"
        PM[Prediction Market]
        PMR[PredictionMarketLZResolver]
        LZ1[LayerZero Endpoint]
    end
    
    subgraph "UMA Network"
        UMA[UMA Optimistic Oracle V3]
        UMR[PredictionMarketLZResolverUmaSide]
        LZ2[LayerZero Endpoint]
        Bonds[Bond Management]
    end
    
    PMR --> LZ1
    UMR --> Bonds
    UMR --> LZ2
    LZ1 -.-> LZ2
```

## Error Handling

### System Error Handling
```mermaid
graph TD
    A[Submit Assertion] --> B{Market Ended?}
    B -->|No| C[MarketNotEnded]
    B -->|Yes| D{Enough Bond?}
    D -->|No| E[NotEnoughBondAmount]
    D -->|Yes| F[Submit to UMA]
    F --> G{UMA Success?}
    G -->|No| H[UMA Error]
    G -->|Yes| I[Success]
```

## Security Considerations

- Centralized bond management
- Single access control point
- Simple state management
- Unidirectional message flow
