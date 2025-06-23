import{u as r,j as e}from"./index-5yfz2rA6.js";const l={title:"Ethereum L1 Gas Implementation",description:"undefined"};function i(s){const n={a:"a",div:"div",em:"em",h1:"h1",h2:"h2",h3:"h3",h4:"h4",header:"header",img:"img",li:"li",ol:"ol",p:"p",strong:"strong",ul:"ul",...r(),...s.components};return e.jsxs(e.Fragment,{children:[e.jsx(n.header,{children:e.jsxs(n.h1,{id:"ethereum-l1-gas-implementation",children:["Ethereum L1 Gas Implementation",e.jsx(n.a,{"aria-hidden":"true",tabIndex:"-1",href:"#ethereum-l1-gas-implementation",children:e.jsx(n.div,{"data-autolink-icon":!0})})]})}),`
`,e.jsx(n.p,{children:e.jsx(n.img,{src:"/images/Diagram1.png",alt:"Diagram",title:"Diagram"})}),`
`,e.jsx(n.p,{children:"The Foil protocol’s backend architecture is structured as an expiring contract that utilizes Uniswap liquidity pools for price discovery."}),`
`,e.jsx(n.p,{children:"Collateral and positions are managed by a protocol settlement contract that exclusively controls deposits and withdrawals of settlement assets into and out of the protocol vault as well as virtual base/quote tokens into and out of the liquidity pool."}),`
`,e.jsx(n.p,{children:"Foil’s architecture is modular and can be implemented in any chain and for any on-chain resource with minimal changes."}),`
`,e.jsxs(n.h2,{id:"ethereum-mainnet-gas-implementation",children:["Ethereum Mainnet Gas Implementation",e.jsx(n.a,{"aria-hidden":"true",tabIndex:"-1",href:"#ethereum-mainnet-gas-implementation",children:e.jsx(n.div,{"data-autolink-icon":!0})})]}),`
`,e.jsx(n.p,{children:"The Ethereum Ethereum Gas market is the generic implementation of Foil protocol. It’s main components are:"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"The Foil settlement contract"}),": which holds collateral assets (which can be any flavor of ETH, like LST and LRTs), mints virtual asset tokens, and handles payouts on settlement. "]}),`
`]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Uniswap V3/V4"}),": Virtual asset tokens are traded on a concentrated liquidity AMM, where price discovery occurs. "]}),`
`]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Virtual asset tokens"}),": vGAS or vGWEI tokens are issued by the Foil settlement contract and represent long and short positions, respectively. There is a unique pool and pair of tokens for every expiry. Additionally, Virtual asset tokens can only be traded on the predetermined AMM pool and not elsewhere. "]}),`
`]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[e.jsx(n.strong,{children:"Decentralized Oracle:"})," Any decentralized offchain compute service (like Chainlink and Pyth) can be used for settlement. Upon settlement, the oracle provides a price at which a given market will expire, defining payouts due from the Foil settlement contract. "]}),`
`]}),`
`,e.jsx(n.p,{children:"The process for opening a position consists of the following operations: 1) depositing collateral to a vault contract via a clearing contract, 2) issuance of virtual tokens (e.g. either vGAS or vGWEI) by the clearing contract on behalf of the user, and 3) transfer of issued virtual tokens into a concentrated liquidity pool by the clearing contract on behalf of the user. "}),`
`,e.jsx(n.p,{children:"To force convergence between the market and index prices, a mean gas price used for settlement is provided via trustless offchain computation using a permissionless function in the clearing contract. In the version of Foil described here, it will not be possible for users to open leveraged positions. This is enforced via strict overcollateralization requirements (e.g. 10x) for positions on the short side of the market and maximum leverage of 1x on the long side of the market. To eliminate potential tail risks from black swan scenarios where the index price has increased well beyond its normal range (e.g. >10x), Foil liquidity pools will enforce predefined trading ranges that mathematically eliminate any possibility of liquidation. "}),`
`,e.jsxs(n.h3,{id:"examples",children:["Examples",e.jsx(n.a,{"aria-hidden":"true",tabIndex:"-1",href:"#examples",children:e.jsx(n.div,{"data-autolink-icon":!0})})]}),`
`,e.jsxs(n.h4,{id:"resource-producer",children:["Resource Producer",e.jsx(n.a,{"aria-hidden":"true",tabIndex:"-1",href:"#resource-producer",children:e.jsx(n.div,{"data-autolink-icon":!0})})]}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User wants to provide OTM short liquidity"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Deposits 100 ETH collateral to account"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Clearinghouse credits 100 ETH to User’s account"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"(note that ETH is used here but Foil’s modular design enables support for any flavor of ETH to be trivially substituted)"}),`
`]}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"GAS market price at 10 GWEI (vGAS/vGWEI pool) [Oracle price = avg(30days)]"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Wants to sell 1B vGAS from 10-30 vGWEI price range"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Mints 1B vGAS, supplies to 10-30 vGWEI tick ranges"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"GAS market price moves to 40 GWEI at settlement "}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsxs(n.p,{children:["Passing through 10-30 vGWEI range means user sold all 1B GAS tokens for 20B vGWEI tokens (@vGAS/vGWEI = 20) - ",e.jsx(n.em,{children:"could be more with fees"})," "]}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"(took net short 1B vGAS position at 20 vGWEI)"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User has 20B vGWEI tokens and owes 1B vGAS tokens"}),`
`]}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Settlement price is 40 vGWEI so user can close 1B short from 20 vGWEI at 40 GvWEI"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"Net loss 20 vGWEI * 1B vGAS = 20 ETH"}),`
`]}),`
`]}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User settles position "}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Settlement = user can exchange vGWEI for vGAS at 40:1 exchange rate"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Swaps 20B vGWEI tokens for 500M vGAS tokens"}),`
`,e.jsxs(n.ul,{children:[`
`,e.jsx(n.li,{children:"(owes 1B vGAS tokens)"}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Needs to acquire another 500M vGAS tokens for 20B vGWEI tokens "}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"20B vGWEI = 20 ETH"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Clearinghouse deducts User’s account balance by 20 ETH"}),`
`]}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User withdraws 80 ETH from account "}),`
`]}),`
`]}),`
`,e.jsxs(n.h4,{id:"resource-consumer",children:["Resource Consumer",e.jsx(n.a,{"aria-hidden":"true",tabIndex:"-1",href:"#resource-consumer",children:e.jsx(n.div,{"data-autolink-icon":!0})})]}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User is an exchange operator who regularly posts withdrawal txn batches to L1 (~30B gas/month)"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Current 30D average gas price is ~25 Gwei"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User checks vGAS/vGWEI pool"}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsx(n.li,{children:"30B vGAS is available to buy for an average price of 35 vGWEI"}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User deposits 30*35 = 1050 ETH to buy 30B vGAS at average price of 35 vGWEI (1x long)"}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsx(n.li,{children:"Clearinghouse credits 1050 ETH to User’s account"}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"1.05T vGWEI minted and sent to pool to buy 30B vGAS "}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"At settlement time GAS index price is 50 Gwei "}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"i.e. user can exchange 30B vGAS tokens for 1.5T vGWEI tokens"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Net gain 15 vGWEI * 30B vGAS = 450 ETH"}),`
`]}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User settles position "}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Redeems 30B vGAS for 1.5T vGWEI via clearing contract"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"1.5T vGWEI = 1500 ETH"}),`
`]}),`
`]}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"User can either close or roll"}),`
`,e.jsxs(n.ol,{children:[`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Close - user withdraws 1500 ETH from clearinghouse"}),`
`]}),`
`,e.jsxs(n.li,{children:[`
`,e.jsx(n.p,{children:"Roll - user withdraws and reopens position in n+1 or n+2 month (if staggered)"}),`
`]}),`
`]}),`
`]}),`
`]})]})}function o(s={}){const{wrapper:n}={...r(),...s.components};return n?e.jsx(n,{...s,children:e.jsx(i,{...s})}):i(s)}export{o as default,l as frontmatter};
