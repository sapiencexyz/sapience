import{u as a,j as e}from"./index-5yfz2rA6.js";const o={title:"Ethereum L2 Gas Implementation",description:"undefined"};function n(i){const t={a:"a",div:"div",h1:"h1",h3:"h3",header:"header",img:"img",li:"li",p:"p",ul:"ul",...a(),...i.components};return e.jsxs(e.Fragment,{children:[e.jsx(t.header,{children:e.jsxs(t.h1,{id:"ethereum-l2-gas-implementation",children:["Ethereum L2 Gas Implementation",e.jsx(t.a,{"aria-hidden":"true",tabIndex:"-1",href:"#ethereum-l2-gas-implementation",children:e.jsx(t.div,{"data-autolink-icon":!0})})]})}),`
`,e.jsx(t.p,{children:e.jsx(t.img,{src:"/images/Diagram3.png",alt:"Diagram",title:"Diagram"})}),`
`,e.jsx(t.p,{children:"Ethereum L1 gas market liquidity is hard to scale given the cashflow mismatch problem introduced by EIP-1559 (the base fee is the main component of the fee the user wants to hedge). After EIP1559, the base fee gets burnt instead of going to validators, limiting validator revenue to priority tips. This in turn limits validators to sell block production upfront at a liquidity level that doesn’t meet demand."}),`
`,e.jsx(t.p,{children:"Rollups with centralized sequencers, as well as Gnosis Chain, have a specific address that earns the totality or a majority of the user fee. Foil can use an NFT issued to the fee collector address, which allows the address to collateralise its positions with future fee revenue. Two different implementations are:"}),`
`,e.jsxs(t.h3,{id:"implementation-a",children:["Implementation A:",e.jsx(t.a,{"aria-hidden":"true",tabIndex:"-1",href:"#implementation-a",children:e.jsx(t.div,{"data-autolink-icon":!0})})]}),`
`,e.jsxs(t.ul,{children:[`
`,e.jsx(t.li,{children:"Fee Collector Address holds NFT collateral in Foil protocol account"}),`
`,e.jsx(t.li,{children:"An automated LP vault LPs a governance-defined range"}),`
`,e.jsx(t.li,{children:"There is consistent distributed liquidity of Foil subscriptions for users"}),`
`]}),`
`,e.jsxs(t.h3,{id:"implementation-b",children:["Implementation B:",e.jsx(t.a,{"aria-hidden":"true",tabIndex:"-1",href:"#implementation-b",children:e.jsx(t.div,{"data-autolink-icon":!0})})]}),`
`,e.jsxs(t.ul,{children:[`
`,e.jsx(t.li,{children:"Fee Collector Address holds NFT collateral in Foil protocol account"}),`
`,e.jsx(t.li,{children:"A Safe module is built to enable governance-triggered auctions of Foil subscriptions"}),`
`,e.jsx(t.li,{children:"Via governance, large agreements can be settled between the Fee Collector Address and consistent consumers of blockspace in the given L2 or sidechain."}),`
`]})]})}function r(i={}){const{wrapper:t}={...a(),...i.components};return t?e.jsx(t,{...i,children:e.jsx(n,{...i})}):n(i)}export{r as default,o as frontmatter};
