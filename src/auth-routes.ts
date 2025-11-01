import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { AuthDatabase } from './auth-database.js';

export function createAuthRoutes(authDb: AuthDatabase): Router {
  const router = Router();

  // Initialize Google OAuth client
  const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  /**
   * Exchange Google ID token for API key (for iOS app)
   * POST /auth/google
   * Body: { idToken: string }
   * Returns: { userId, email, name, apiKey, pictureUrl }
   */
  router.post('/google', async (req: Request, res: Response) => {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({ error: 'idToken is required' });
      }

      // Verify Google ID token
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(401).json({ error: 'Invalid Google token' });
      }

      // Find or create user
      const user = await authDb.findOrCreateUser({
        id: payload.sub,
        email: payload.email!,
        name: payload.name || payload.email!,
        picture: payload.picture,
      });

      console.log(`✅ User authenticated: ${user.email}`);

      res.json({
        userId: user.id,
        email: user.email,
        name: user.name,
        apiKey: user.api_key,
        pictureUrl: user.picture_url,
      });
    } catch (error: any) {
      console.error('❌ Error verifying Google token:', error);
      res.status(401).json({ error: 'Invalid token', message: error.message });
    }
  });

  /**
   * Refresh API key
   * POST /auth/api-key/refresh
   * Headers: { Authorization: Bearer <current-api-key> }
   * Returns: { apiKey }
   */
  router.post('/api-key/refresh', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
      }

      const currentApiKey = authHeader.substring(7);
      const user = await authDb.findUserByApiKey(currentApiKey);

      if (!user) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      const newApiKey = await authDb.refreshApiKey(user.id);

      console.log(`✅ API key refreshed for user: ${user.email}`);

      res.json({ apiKey: newApiKey });
    } catch (error: any) {
      console.error('❌ Error refreshing API key:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * Get current user info
   * GET /auth/me
   * Headers: { Authorization: Bearer <api-key> }
   * Returns: { userId, email, name, pictureUrl }
   */
  router.get('/me', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
      }

      const apiKey = authHeader.substring(7);
      const user = await authDb.findUserByApiKey(apiKey);

      if (!user) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      res.json({
        userId: user.id,
        email: user.email,
        name: user.name,
        pictureUrl: user.picture_url,
      });
    } catch (error: any) {
      console.error('❌ Error getting user info:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * OAuth authorization endpoint (for MCP servers)
   * GET /oauth/authorize?client_id=xxx&redirect_uri=xxx&scope=xxx&state=xxx
   *
   * Flow:
   * 1. User is redirected here from MCP server
   * 2. We redirect to Google for authentication
   * 3. Google redirects back to /oauth/google-callback
   * 4. We redirect to MCP with authorization code
   */
  router.get('/authorize', async (req: Request, res: Response) => {
    try {
      const { client_id, redirect_uri, scope, state, response_type } = req.query;

      // Validate parameters
      if (!client_id || !redirect_uri || !scope) {
        return res.status(400).send('Missing required parameters');
      }

      if (response_type !== 'code') {
        return res.status(400).send('Only response_type=code is supported');
      }

      // Verify client exists and redirect_uri is allowed
      const client = await authDb.getOAuthClient(client_id as string);
      if (!client) {
        return res.status(400).send('Invalid client_id');
      }

      if (!client.redirect_uris.includes(redirect_uri as string)) {
        return res.status(400).send('Invalid redirect_uri');
      }

      // Validate scopes
      const requestedScopes = (scope as string).split(' ');
      const invalidScopes = requestedScopes.filter(s => !client.allowed_scopes.includes(s));
      if (invalidScopes.length > 0) {
        return res.status(400).send(`Invalid scopes: ${invalidScopes.join(', ')}`);
      }

      // Store OAuth request in session/temp storage
      // For now, encode it in the state parameter to Google
      const oauthState = Buffer.from(
        JSON.stringify({
          client_id,
          redirect_uri,
          scope,
          state: state || '',
        })
      ).toString('base64');

      // Redirect to Google for authentication
      const googleAuthUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: ['email', 'profile'],
        state: oauthState,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI, // Different from client redirect_uri
        prompt: 'select_account', // Force Google to show account picker
      });

      res.redirect(googleAuthUrl);
    } catch (error: any) {
      console.error('❌ Error in OAuth authorize:', error);
      res.status(500).send('Internal server error');
    }
  });

  /**
   * Google OAuth callback (internal)
   * GET /oauth/google-callback?code=xxx&state=xxx
   *
   * This is where Google redirects after user authenticates
   */
  router.get('/google-callback', async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).send('Missing code or state');
      }

      // Decode the OAuth request from state
      const oauthRequest = JSON.parse(
        Buffer.from(state as string, 'base64').toString('utf-8')
      );

      // Exchange code for Google tokens
      const { tokens } = await googleClient.getToken({
        code: code as string,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      });

      googleClient.setCredentials(tokens);

      // Get user info from Google
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.status(401).send('Invalid Google token');
      }

      // Find or create user
      const user = await authDb.findOrCreateUser({
        id: payload.sub,
        email: payload.email!,
        name: payload.name || payload.email!,
        picture: payload.picture,
      });

      // Create authorization code for the MCP client
      const authCode = await authDb.createOAuthToken(
        user.id,
        oauthRequest.client_id,
        oauthRequest.scope.split(' '),
        300 // 5 minutes for authorization code
      );

      // Redirect back to MCP with authorization code
      const redirectUrl = new URL(oauthRequest.redirect_uri);
      redirectUrl.searchParams.set('code', authCode.accessToken); // Use access token as code
      redirectUrl.searchParams.set('state', oauthRequest.state);

      console.log(`✅ OAuth authorized for ${user.email} → ${oauthRequest.client_id}`);

      res.redirect(redirectUrl.toString());
    } catch (error: any) {
      console.error('❌ Error in Google callback:', error);
      res.status(500).send('Authentication failed');
    }
  });

  /**
   * Exchange authorization code for access token (for MCP servers)
   * POST /oauth/token
   * Body: { grant_type, code, client_id, client_secret, redirect_uri }
   * OR: { grant_type: "refresh_token", refresh_token, client_id, client_secret }
   * Returns: { access_token, token_type, expires_in, refresh_token, scope }
   */
  router.post('/token', async (req: Request, res: Response) => {
    try {
      const { grant_type, code, client_id, client_secret, refresh_token } = req.body;

      console.log(`🔑 Token request - grant_type: ${grant_type}, client_id: ${client_id}, has_code: ${!!code}, has_secret: ${!!client_secret}`);

      if (!client_id || !client_secret) {
        console.log(`❌ Missing client_id or client_secret`);
        return res.status(400).json({ error: 'client_id and client_secret are required' });
      }

      // Verify client credentials
      const validClient = await authDb.verifyClientCredentials(client_id, client_secret);
      if (!validClient) {
        return res.status(401).json({ error: 'Invalid client credentials' });
      }

      if (grant_type === 'authorization_code') {
        if (!code) {
          console.log(`❌ Missing code parameter`);
          return res.status(400).json({ error: 'code is required' });
        }

        // Verify authorization code (which is actually a short-lived token)
        const tokenInfo = await authDb.getOAuthToken(code);
        if (!tokenInfo) {
          console.log(`❌ Invalid authorization code - token not found`);
          return res.status(401).json({ error: 'Invalid authorization code' });
        }
        if (tokenInfo.client_id !== client_id) {
          console.log(`❌ Client ID mismatch - expected: ${tokenInfo.client_id}, got: ${client_id}`);
          return res.status(401).json({ error: 'Invalid authorization code' });
        }

        // Delete the authorization code
        await authDb.revokeOAuthToken(code);

        // Create new long-lived access token
        const newToken = await authDb.createOAuthToken(
          tokenInfo.user_id,
          client_id,
          tokenInfo.scopes,
          3600 // 1 hour
        );

        console.log(`✅ Access token issued for client: ${client_id}`);

        res.json({
          access_token: newToken.accessToken,
          token_type: 'Bearer',
          expires_in: newToken.expiresIn,
          refresh_token: newToken.refreshToken,
          scope: tokenInfo.scopes.join(' '),
        });
      } else if (grant_type === 'refresh_token') {
        if (!refresh_token) {
          return res.status(400).json({ error: 'refresh_token is required' });
        }

        const newToken = await authDb.refreshOAuthToken(refresh_token);
        if (!newToken) {
          return res.status(401).json({ error: 'Invalid refresh token' });
        }

        console.log(`✅ Access token refreshed for client: ${client_id}`);

        res.json({
          access_token: newToken.accessToken,
          token_type: 'Bearer',
          expires_in: newToken.expiresIn,
          refresh_token: newToken.refreshToken,
        });
      } else {
        console.log(`❌ Unsupported grant_type: ${grant_type}`);
        return res.status(400).json({ error: 'Unsupported grant_type' });
      }
    } catch (error: any) {
      console.error('❌ Error in token exchange:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * Revoke token
   * POST /oauth/revoke
   * Body: { token, client_id, client_secret }
   * Returns: { success: true }
   */
  router.post('/revoke', async (req: Request, res: Response) => {
    try {
      const { token, client_id, client_secret } = req.body;

      if (!token || !client_id || !client_secret) {
        return res.status(400).json({ error: 'token, client_id, and client_secret are required' });
      }

      // Verify client credentials
      const validClient = await authDb.verifyClientCredentials(client_id, client_secret);
      if (!validClient) {
        return res.status(401).json({ error: 'Invalid client credentials' });
      }

      await authDb.revokeOAuthToken(token);

      console.log(`✅ Token revoked for client: ${client_id}`);

      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ Error revoking token:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * Token introspection (for resource servers to validate tokens)
   * POST /oauth/introspect
   * Body: { token }
   * Returns: { active: true, user_id, email, scopes, exp }
   */
  router.post('/introspect', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'token is required' });
      }

      const tokenInfo = await authDb.getOAuthToken(token);
      if (!tokenInfo) {
        return res.json({ active: false });
      }

      const user = await authDb.findUserById(tokenInfo.user_id);
      if (!user) {
        return res.json({ active: false });
      }

      res.json({
        active: true,
        user_id: user.id,
        email: user.email,
        scopes: tokenInfo.scopes,
        exp: Math.floor(tokenInfo.expires_at.getTime() / 1000),
      });
    } catch (error: any) {
      console.error('❌ Error introspecting token:', error);
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  });

  /**
   * Dynamic Client Registration (RFC 7591)
   * POST /oauth/register
   * Body: { redirect_uris: string[], client_name?: string, grant_types?: string[] }
   * Returns: { client_id, client_secret, client_id_issued_at, client_secret_expires_at }
   */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { redirect_uris, client_name, grant_types, scope } = req.body;

      // Validate redirect_uris
      if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: 'redirect_uris is required and must be a non-empty array',
        });
      }

      // Validate each redirect URI
      for (const uri of redirect_uris) {
        try {
          const url = new URL(uri);
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return res.status(400).json({
              error: 'invalid_redirect_uri',
              error_description: `Invalid redirect URI protocol: ${uri}`,
            });
          }
        } catch (error) {
          return res.status(400).json({
            error: 'invalid_redirect_uri',
            error_description: `Invalid redirect URI format: ${uri}`,
          });
        }
      }

      // Generate client_id
      const client_id = `chatgpt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Parse scopes
      const requestedScopes = scope ? scope.split(' ') : ['read:food', 'write:food', 'profile'];
      const allowedScopes = ['read:food', 'write:food', 'profile'];
      const finalScopes = requestedScopes.filter((s: string) => allowedScopes.includes(s));

      // Create OAuth client in database (generates client_secret automatically)
      const createdClient = await authDb.createOAuthClient({
        client_id,
        name: client_name || 'ChatGPT Dynamic Client',
        redirect_uris,
        allowed_scopes: finalScopes,
      });

      console.log(`✅ Dynamic client registered: ${client_id} (${client_name || 'ChatGPT Dynamic Client'})`);

      // Return RFC 7591 compliant response
      res.status(201).json({
        client_id,
        client_secret: createdClient.client_secret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0, // Never expires
        redirect_uris,
        grant_types: grant_types || ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'client_secret_post',
        client_name: client_name || 'ChatGPT Dynamic Client',
      });
    } catch (error: any) {
      console.error('❌ Error registering client:', error);
      res.status(500).json({ error: 'server_error', error_description: error.message });
    }
  });

  return router;
}
