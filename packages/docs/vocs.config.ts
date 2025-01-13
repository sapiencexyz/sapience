import { defineConfig } from "vocs";

export default defineConfig({
  title: "Foil",
  theme: {
    colorScheme: "light",
  },
  logoUrl: "/images/logo.svg",
  sidebar: [
    {
      text: "Get Started",
      link: "/",
    },
    {
      text: "Overview",
      collapsed: false,
      items: [
        {
          text: "Problem: Predictable Onchain Expenditures",
          link: "/problem",
        },
        {
          text: "Solution: Foil Onchain Marketplaces",
          link: "/solution",
        },
        {
          text: "Opportunity: Everything Onchain",
          link: "/opportunity",
        },
      ],
    },
    {
      text: "Protocol Architecture",
      collapsed: false,
      items: [
        {
          text: "Ethereum L1 Gas Implementation",
          link: "/l1-implementation",
        },
        {
          text: "Token Vault",
          link: "/token-vault",
        },
        {
          text: "Ethereum L2 Gas Implementation",
          link: "/l2-implementation",
        },
        {
          text: "Market Settlement",
          link: "/market-settlement",
        },
      ],
    },
    {
      text: "Technical Documentation",
      collapsed: false,
      items: [
        {
          text: "Deployments",
          link: "https://usecannon.com/packages/foil",
        },
        {
          text: "Source Code",
          link: "https://github.com/foilxyz/foil",
        },
      ],
    },
  ],
});
