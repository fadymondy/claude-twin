/**
 * @claude-twin/mcp-server
 *
 * Entry point. Boots the MCP server over stdio. The actual tool surface
 * lands in #3; this file is a placeholder so the workspace builds cleanly.
 */

export const VERSION = '0.0.0';

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('[claude-twin/mcp-server] not implemented yet — see issue #3');
  process.exit(1);
}
