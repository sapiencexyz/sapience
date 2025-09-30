import { defineConfig } from "vocs";

export default defineConfig({
  title: "Sapience",
  logoUrl: {
    light: "/sapience.svg",
    dark: "/sapience-dark.svg",
  },
  topNav: [
    {
      text: "User Guide",
      link: "/user-guide/introduction/what-is-sapience",
      match: "/user-guide",
    },
    {
      text: "Builder Guide",
      link: "/getting-started/what-is-sapience",
      match: "/guides",
    },
  ],
  banner: {
    dismissable: "false" as unknown as boolean,
    backgroundColor: "#0588f0",
    textColor: "white",
    height: "40px",
    content:
      "Docs are heavily under construction. Some information is incorrect. Share feedback in [Discord](https://discord.gg/sapience).",
  },
  theme: {
    accentColor: {
      backgroundAccent: {
        light: "rgba(145, 179, 240, 0.2)",
        dark: "rgba(145, 179, 240, 0.2)",
      },
      backgroundAccentHover: {
        light: "rgba(145, 179, 240, 0.3)",
        dark: "rgba(145, 179, 240, 0.3)",
      },
      backgroundAccentText: {
        light: "black",
        dark: "white",
      },
      borderAccent: {
        light: "rgba(145, 179, 240, 0.8)",
        dark: "rgba(145, 179, 240, 0.8)",
      },
      textAccent: {
        light: "#91B3F0",
        dark: "#91B3F0",
      },
      textAccentHover: {
        light: "#7AA1EE",
        dark: "#7AA1EE",
      },
    },
  },
  sidebar: {
    "/": [
      {
        text: "Getting Started",
        items: [
          {
            text: "What is Sapience?",
            link: "/getting-started/what-is-sapience",
          },
          { text: "Quickstart", link: "/getting-started/quickstart" },
        ],
      },
      {
        text: "Builder Guides",
        items: [
          { text: "Forecasting Agent", link: "/guides/forecasting-agent" },
          {
            text: "Prediction Market Trading Bot",
            link: "/guides/trading-bots",
          },
          {
            text: "Liquidity Provisioning Bot",
            link: "/guides/liquidity-provisioning-bots",
          },
          {
            text: "Batch Auction Market Bot",
            link: "/guides/trading-auction-intent-markets",
          },
          { text: "Custom Trading App", link: "/guides/custom-trading-app" },
          {
            text: "Dashboards, Games, and more",
            link: "/guides/design-dashboards-games",
          },
        ],
      },
      {
        text: "API",
        items: [
          { text: "GraphQL", link: "/api/graphql" },
          { text: "Quoter", link: "/api/quoter" },
          { text: "Batch Auction Relayer", link: "/api/auction-relayer" },
          { text: "MCP", link: "/api/mcp" },
        ],
      },
      {
        text: "Reference",
        items: [
          {
            text: "Contracts & Addresses",
            link: "/reference/contracts-and-addresses",
          },
          { text: "GraphQL Schema", link: "/reference/graphql-schema" },
          { text: "Batch Auction Relayer", link: "/reference/auction-relayer" },
          {
            text: "Oracles & Settlement",
            link: "/reference/oracles-and-settlement",
          },
          { text: "UI components", link: "/storybook" },
        ],
      },
      { text: "FAQ", link: "/faq" },
      { text: "Contributing", link: "/contributing" },
    ],
    "/user-guide": [
      {
        text: "Introduction",
        items: [
          {
            text: "What is Sapience?",
            link: "/user-guide/introduction/what-is-sapience",
          },
          {
            text: "Why Build on Sapience?",
            link: "/user-guide/introduction/why-build-on-sapience",
          },
        ],
      },
      {
        text: "Trading on Sapience",
        items: [
          { text: "Overview", link: "/user-guide/trading/overview" },
          { text: "Market Types", link: "/user-guide/trading/market-types" },
          {
            text: "Market Lifecycle",
            link: "/user-guide/trading/market-lifecycle",
          },
          {
            text: "Pricing & Order Types",
            link: "/user-guide/trading/pricing-and-order-types",
          },
          {
            text: "Resolution & Disputes",
            link: "/user-guide/trading/resolution-and-disputes",
          },
        ],
      },
      {
        text: "Liquidity Provisioning",
        items: [
          { text: "Overview", link: "/user-guide/liquidity-provisioning" },
          {
            text: "Tutorial",
            link: "/user-guide/liquidity-provisioning/tutorial",
          },
        ],
      },
      {
        text: "Deposits & Withdrawals",
        items: [
          { text: "Overview", link: "/user-guide/deposits-and-withdrawals" },
        ],
      },
      {
        text: "Risks & Safeguards",
        items: [{ text: "Overview", link: "/user-guide/risks-and-safeguards" }],
      },
      {
        text: "Fees & Incentives",
        items: [{ text: "Overview", link: "/user-guide/fees-and-incentives" }],
      },
      {
        text: "Other Resources",
        items: [
          { text: "Audits", link: "/user-guide/other-resources/audits" },
          {
            text: "Brand Assets",
            link: "/user-guide/other-resources/brand-assets",
          },
          {
            text: "Contact & Community",
            link: "/user-guide/other-resources/contact-and-community",
          },
          { text: "FAQ", link: "/user-guide/other-resources/faq" },
          {
            text: "Glossary of Terms",
            link: "/user-guide/other-resources/glossary",
          },
        ],
      },
    ],
    "/user-guide/": [
      {
        text: "Introduction",
        items: [
          {
            text: "What is Sapience?",
            link: "/user-guide/introduction/what-is-sapience",
          },
          {
            text: "Why Build on Sapience?",
            link: "/user-guide/introduction/why-build-on-sapience",
          },
        ],
      },
      {
        text: "Trading on Sapience",
        items: [
          { text: "Overview", link: "/user-guide/trading/overview" },
          { text: "Market Types", link: "/user-guide/trading/market-types" },
          {
            text: "Market Lifecycle",
            link: "/user-guide/trading/market-lifecycle",
          },
          {
            text: "Pricing & Order Types",
            link: "/user-guide/trading/pricing-and-order-types",
          },
          {
            text: "Resolution & Disputes",
            link: "/user-guide/trading/resolution-and-disputes",
          },
        ],
      },
      {
        text: "Liquidity Provisioning",
        items: [
          { text: "Overview", link: "/user-guide/liquidity-provisioning" },
          {
            text: "Tutorial",
            link: "/user-guide/liquidity-provisioning/tutorial",
          },
        ],
      },
      {
        text: "Deposits & Withdrawals",
        items: [
          { text: "Overview", link: "/user-guide/deposits-and-withdrawals" },
        ],
      },
      {
        text: "Risks & Safeguards",
        items: [{ text: "Overview", link: "/user-guide/risks-and-safeguards" }],
      },
      {
        text: "Fees & Incentives",
        items: [{ text: "Overview", link: "/user-guide/fees-and-incentives" }],
      },
      {
        text: "Other Resources",
        items: [
          { text: "Audits", link: "/user-guide/other-resources/audits" },
          {
            text: "Brand Assets",
            link: "/user-guide/other-resources/brand-assets",
          },
          {
            text: "Contact & Community",
            link: "/user-guide/other-resources/contact-and-community",
          },
          { text: "FAQ", link: "/user-guide/other-resources/faq" },
          {
            text: "Glossary of Terms",
            link: "/user-guide/other-resources/glossary",
          },
        ],
      },
    ],
  },
});
