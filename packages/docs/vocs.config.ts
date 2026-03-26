import { defineConfig } from "vocs";

export default defineConfig({
  ogImageUrl:
    "https://vocs.dev/api/og?logo=https%3A%2F%2Fdocs.sapience.xyz%2Flogo.svg&title=%title&description=%description",
  title: "Sapience",
  logoUrl: "/logo.svg",
  head: [
    ["link", { rel: "stylesheet", href: "/styles.css" }],
  ] as any,
  theme: {
    colorScheme: "dark",
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
      { text: "Open App", link: "https://sapience.xyz" },
      { text: "User Guide", link: "/user-guide/introduction/what-is-sapience", match: "/user-guide" as any },
      { text: "Builder Guide", link: "/builder-guide/getting-started/get-started", match: "/builder-guide" as any },
      {
        text: "Build Something",
        items: [
          { text: "Get Started", link: "/builder-guide/getting-started/get-started" },
          { text: "Forecasting Agent", link: "/builder-guide/guides/forecasting-agent" },
          {
            text: "Trading Agent",
            link: "/builder-guide/guides/trading-agent",
          },
          {
            text: "Market Making Agent",
            link: "/builder-guide/guides/market-making-agent",
          },
          { text: "Apps and Interfaces", link: "/builder-guide/guides/prediction-market-app" },
        ],
      },
      {
        text: "API",
        items: [
          { text: "Data", link: "/builder-guide/api/graphql" },
          { text: "Auction Relayer", link: "/builder-guide/api/auction-relayer" },
        ],
      },
      {
        text: "Reference",
        items: [
          {
            text: "Contracts & Addresses",
            link: "/builder-guide/reference/contracts-and-addresses",
          },
          { text: "UI Components", link: "/builder-guide/storybook" },
          { text: "Source Code", link: "https://github.com/sapiencexyz/sapience" },
        ],
      },
    ],
    "/user-guide": [
      { text: "Open App", link: "https://sapience.xyz" },
      { text: "User Guide", link: "/user-guide/introduction/what-is-sapience", match: "/user-guide" as any },
      { text: "Builder Guide", link: "/builder-guide/getting-started/get-started", match: "/builder-guide" as any },
      {
        text: "Introduction",
        items: [
          {
            text: "What is Sapience?",
            link: "/user-guide/introduction/what-is-sapience",
          },
          {
            text: "Glossary",
            link: "/user-guide/introduction/glossary",
          },
        ],
      },
      {
        text: "Agents",
        items: [
          { text: "OpenClaw", link: "/user-guide/agents/openclaw" },
          { text: "Claude Code", link: "/user-guide/agents/claude-code" },
          { text: "OpenAI Codex", link: "/user-guide/agents/codex" },
        ],
      },
      {
        text: "Trading Prediction Markets",
        items: [
          { text: "Getting Started", link: "/user-guide/trading/overview" },
          { text: "Auctions", link: "/user-guide/trading/auctions" },
          { text: "Resolution", link: "/user-guide/trading/resolution" },
        ],
      },
      {
        text: "Providing Liquidity",
        items: [
          { text: "Market Making", link: "/user-guide/market-making" },
          { text: "Liquidity Vaults", link: "/user-guide/liquidity-vaults" },
        ],
      },
      {
        text: "Resources",
        items: [
          { text: "Bug Bounty", link: "/user-guide/other-resources/bugbounty" },
          { text: "Audits", link: "/user-guide/other-resources/audits" },
          {
            text: "Brand Assets",
            link: "/user-guide/other-resources/brand-assets",
          },
          { text: "Discord", link: "https://discord.gg/sapience" },
          { text: "X", link: "https://x.com/sapiencemarkets" },
        ],
      },
    ],
  },
} as any);
