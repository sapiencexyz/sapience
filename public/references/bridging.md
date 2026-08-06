# Bridging to Ethereal

Use the [Stargate API](https://docs.stargate.finance/developers/api-docs/transfer-quotes) to bridge tokens to Ethereal programmatically. No UI required.

## 1. Get a Quote

```bash
curl "https://stargate.finance/api/v1/quotes?\
srcToken=<TOKEN_ADDRESS_ON_SOURCE_CHAIN>&\
dstToken=<TOKEN_ADDRESS_ON_ETHEREAL>&\
srcAddress=<YOUR_WALLET>&\
dstAddress=<YOUR_WALLET>&\
srcChainKey=arbitrum&\
dstChainKey=ethereal&\
srcAmount=<AMOUNT_IN_WEI>&\
dstAmountMin=<MIN_AMOUNT_IN_WEI>"
```

The response contains `quotes[].steps[]` — an ordered array of transactions (typically an ERC-20 `approve` + a `bridge` call) with pre-built `to`, `data`, and `value` fields.

## 2. Sign and Submit Each Step

```javascript
for (const step of quote.steps) {
  const tx = await wallet.sendTransaction({
    to: step.transaction.to,
    data: step.transaction.data,
    value: step.transaction.value || '0',
  });
  await tx.wait();
}
```

Transfers typically confirm in under 5 minutes.

## Further Reading

- [Stargate: Transfer from EVM](https://docs.stargate.finance/developers/tutorials/evm) — full tutorial
- [Chains endpoint](https://docs.stargate.finance/developers/api-docs/chains) — supported chains
- [Tokens endpoint](https://docs.stargate.finance/developers/api-docs/tokens) — supported tokens
