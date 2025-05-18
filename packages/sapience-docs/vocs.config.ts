import { defineConfig } from 'vocs'

export default defineConfig({
  title: 'Sapience',
  sidebar: [
    {
      text: 'Overview',
      link: '/',
    },
    {
      text: 'Build a Bot',
      link: '/quick-start',
    },
    {
      text: 'FAQ',
      link: '/faq',
    },
    {
      text: 'Use Cursor',
      link: '/cursor',
    },
    {
      text: 'Protocol',
      items: [
        {
          text: 'Technical Reference',
          link: '/technical-reference',
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
