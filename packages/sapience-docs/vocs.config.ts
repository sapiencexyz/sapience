import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'Sapience',
  sidebar: [
    {
      text: 'Overview',
      link: '/',
    },
    {
      text: 'Quick Start',
      link: '/quick-start',
    },
    {
      text: 'FAQ',
      link: '/faq',
    },
    {
      text: 'Trade Onchain',
      items: [
        {
          text: 'TypeScript Guide',
          link: '/typescript',
        },
        {
          text: 'Protocol Reference',
          link: '/protocol',
        },
      ],
    },
    {
      text: 'API',
      items: [
        {
          text: 'GraphQL',
          link: '/api/graphql',
        },
        {
          text: 'Quoter',
          link: '/api/quoter',
        },
        {
          text: 'MCP',
          link: '/api/mcp',
        },
      ],
    },
  ],
})
