-- Add Claude callback URLs to food-mcp-production OAuth client
-- This allows Claude.ai to authenticate users

UPDATE oauth_clients
SET redirect_uris = array_cat(
  redirect_uris,
  ARRAY[
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback'
  ]
)
WHERE client_id = 'food-mcp-production'
  AND NOT ('https://claude.ai/api/mcp/auth_callback' = ANY(redirect_uris));

-- Verify the update
SELECT
  client_id,
  name,
  redirect_uris,
  allowed_scopes
FROM oauth_clients
WHERE client_id = 'food-mcp-production';
