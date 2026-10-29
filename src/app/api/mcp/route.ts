import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { verifyToken } from '@/lib/mcp/context'
import { registerHelmTools } from '@/lib/mcp/tools'

/**
 * Helm's MCP server: https://<site>/api/mcp. Add it as a connector in Claude, ChatGPT, Cursor or any MCP client.
 * The client signs the person in through Supabase's OAuth server (consent at /oauth/consent); every tool call
 * then runs as that person under Row Level Security.
 */
export const maxDuration = 60

const handler = createMcpHandler((server) => registerHelmTools(server), {
  serverInfo: { name: 'Helm by Seven Billion', version: '1.0.0' },
  instructions: 'Helm is Seven Billion\'s client delivery workspace: projects, plans and tasks, customer requests, approvals and weekly updates. Call whoami first. Use search or list_projects to find ids. Writes act as the signed-in person and show in Helm straight away; confirm with the person before creating or changing anything.',
})

const authed = withMcpAuth(handler, verifyToken, { required: true, resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp' })

export { authed as GET, authed as POST, authed as DELETE }
