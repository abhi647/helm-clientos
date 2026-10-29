import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'

/**
 * RFC 9728 metadata for the MCP server: tells AI clients that Helm's sign-in is Supabase Auth's OAuth server.
 * Served at /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/api/mcp.
 */
const handler = (req: Request) => protectedResourceHandler({
  authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
  resourceUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/api/mcp`,
})(req)

export { handler as GET }
export const OPTIONS = metadataCorsOptionsRequestHandler()
