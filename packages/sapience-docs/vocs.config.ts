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
      text: 'Add Docs to Cursor',
      link: '/docs-for-cursor',
    },
    {
      text: 'MCP',
      items: [
        {
          text: 'Use with Claude',
          link: '/mcp/use-with-claude',
        },
        {
          text: 'Use with Cursor',
          link: '/mcp/use-with-cursor',
        },
        {
          text: 'Use with Langchain',
          link: '/mcp/use-with-langchain',
        },
        {
          text: 'Use with Google ADK',
          link: '/mcp/use-with-google-adk',
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
  ],
})
