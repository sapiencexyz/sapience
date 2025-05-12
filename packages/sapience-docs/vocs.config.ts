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
      text: 'Protocol',
      items: [
        {
          text: 'Protocol Summary',
          link: '/protocol-overview',
        },
        {
          text: 'Smart Contract Reference',
          link: '/protocol-reference',
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
