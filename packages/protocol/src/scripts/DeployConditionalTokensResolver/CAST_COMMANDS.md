# Manual Cast Commands for LayerZero Configuration

If you're having issues with forge scripts, you can execute the LayerZero configuration commands manually using `cast`.

## Polygon Reader Configuration (SEND side)

### Step 1: Set Send Library

```bash
cast send 0x1a44076050125825900e736c501f859c50fE728c \
  "setSendLibrary(address,uint32,address)" \
  0x26DB702647e56B230E15687bFbC48b526E131dAe \
  30110 \
  0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3 \
  --rpc-url $POLYGON_RPC \
  --private-key $POLYGON_PRIVATE_KEY
```

### Step 2: Encode ExecutorConfig

```bash
# ExecutorConfig(uint32 maxMessageSize, address executor)
EXECUTOR_CONFIG=$(cast abi-encode "f(uint32,address)" 10000 0xCd3F213AD101472e1713C72B1697E727C803885b)
echo "ExecutorConfig: $EXECUTOR_CONFIG"
```

### Step 3: Encode UlnConfig

```bash
# UlnConfig(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)
ULN_CONFIG=$(cast abi-encode \
  "f(uint64,uint8,uint8,uint8,address[],address[])" \
  20 \
  2 \
  255 \
  0 \
  "[0x23DE2FE932d9043291f870324B74F820e11dc81A,0xD56e4eAb23cb81f43168F9F45211Eb027b9aC7cc]" \
  "[]")
echo "UlnConfig: $ULN_CONFIG"
```

### Step 4: Set Config (Executor + DVN)

```bash
cast send 0x1a44076050125825900e736c501f859c50fE728c \
  "setConfig(address,address,(uint32,uint32,bytes)[])" \
  0x26DB702647e56B230E15687bFbC48b526E131dAe \
  0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3 \
  "[(30110,1,$EXECUTOR_CONFIG),(30110,2,$ULN_CONFIG)]" \
  --rpc-url $POLYGON_RPC \
  --private-key $POLYGON_PRIVATE_KEY
```

## Ethereal Resolver Configuration (RECEIVE side)

### Step 1: Set Receive Library

```bash
cast send 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B \
  "setReceiveLibrary(address,uint32,address,uint32)" \
  $ETHEREAL_CONDITIONAL_TOKENS_RESOLVER \
  30109 \
  $ETHEREAL_RECEIVE_LIB \
  0 \
  --rpc-url $ETHEREAL_RPC \
  --private-key $ETHEREAL_PRIVATE_KEY
```

### Step 2: Encode UlnConfig for Receive

```bash
ULN_CONFIG=$(cast abi-encode \
  "f(uint64,uint8,uint8,uint8,address[],address[])" \
  20 \
  1 \
  255 \
  0 \
  "[$ETHEREAL_DVN]" \
  "[]")
echo "UlnConfig: $ULN_CONFIG"
```

### Step 3: Set Receive Config

```bash
cast send 0x6F475642a6e85809B1c36Fa62763669b1b48DD5B \
  "setConfig(address,address,(uint32,uint32,bytes)[])" \
  $ETHEREAL_CONDITIONAL_TOKENS_RESOLVER \
  $ETHEREAL_RECEIVE_LIB \
  "[(30109,2,$ULN_CONFIG)]" \
  --rpc-url $ETHEREAL_RPC \
  --private-key $ETHEREAL_PRIVATE_KEY
```

## Using the Bash Scripts

Alternatively, you can use the provided bash scripts:

```bash
# Polygon
export POLYGON_PRIVATE_KEY=0x...
export POLYGON_RPC=https://polygon-rpc.com
bash src/scripts/DeployConditionalTokensResolver/setDVN_polygon.sh

# Ethereal
export ETHEREAL_PRIVATE_KEY=0x...
export ETHEREAL_RPC=https://rpc.ethereal.trade
export ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=0x...
export ETHEREAL_RECEIVE_LIB=0x...
export ETHEREAL_DVN=0x...
bash src/scripts/DeployConditionalTokensResolver/setDVN_ethereal.sh
```

## Config Type Constants

- `1` = EXECUTOR_CONFIG_TYPE (for send config)
- `2` = ULN_CONFIG_TYPE / RECEIVE_CONFIG_TYPE (for receive config)

## Notes

- Replace all addresses and values with your actual deployed addresses
- Make sure you have enough native token (MATIC on Polygon, USDe on Ethereal) for gas
- The `255` value for `optionalDVNCount` represents `type(uint8).max` (no optional DVNs)
- Empty arrays are represented as `[]`

