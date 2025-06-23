import{u as s,j as e}from"./index-5yfz2rA6.js";const a={title:"Market Settlement",description:"undefined"};function i(n){const t={a:"a",code:"code",div:"div",h1:"h1",h2:"h2",header:"header",li:"li",p:"p",ul:"ul",...s(),...n.components};return e.jsxs(e.Fragment,{children:[e.jsx(t.header,{children:e.jsxs(t.h1,{id:"market-settlement",children:["Market Settlement",e.jsx(t.a,{"aria-hidden":"true",tabIndex:"-1",href:"#market-settlement",children:e.jsx(t.div,{"data-autolink-icon":!0})})]})}),`
`,e.jsx(t.p,{children:"The Foil protocol architecture is modular, allowing different deployments to utilize different strategies for determining the settlement price after the expiration of a given market."}),`
`,e.jsxs(t.h2,{id:"uma",children:["UMA",e.jsx(t.a,{"aria-hidden":"true",tabIndex:"-1",href:"#uma",children:e.jsx(t.div,{"data-autolink-icon":!0})})]}),`
`,e.jsxs(t.p,{children:[e.jsx(t.a,{href:"https://uma.xyz/",children:"UMA"}),"’s Optimistic Oracle can be used to determine the settlement price for a Foil market."]}),`
`,e.jsxs(t.ul,{children:[`
`,e.jsxs(t.li,{children:["After ",e.jsx(t.code,{children:"block.timestamp"})," exceeds the ",e.jsx(t.code,{children:"endTime"})," of the market, all market activity (including deposits and withdrawals) is halted, and an asserter can call submitFinalPrice with a settlementPrice for the market, also providing a bond (configurable, typically 5,000 USDC)."]}),`
`,e.jsx(t.li,{children:"During a challenge window (configurable, typically two hours by default) following submission, anyone can dispute this settlement price by posting an equal-sized bond."}),`
`,e.jsx(t.li,{children:"If no dispute is submitted during this period, anyone can call settle. Market participants can then withdraw collateral based on the value of their position according to the settlement price."}),`
`,e.jsxs(t.li,{children:["If a dispute is submitted, UMA tokenholders vote during a 48-96 hour voting period to determine whether the assertion is true or false.",`
`,e.jsxs(t.ul,{children:[`
`,e.jsx(t.li,{children:"If the vote resolves to true, the dispute loses their bond, and the system behaves as if no dispute was submitted."}),`
`,e.jsx(t.li,{children:"If the vote resolves to false, the asserter loses their bond, and another settlement price must be submitted."}),`
`]}),`
`]}),`
`]})]})}function l(n={}){const{wrapper:t}={...s(),...n.components};return t?e.jsx(t,{...n,children:e.jsx(i,{...n})}):i(n)}export{l as default,a as frontmatter};
