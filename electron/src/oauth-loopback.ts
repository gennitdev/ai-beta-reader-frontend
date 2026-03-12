import { ipcMain, shell } from 'electron';
import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  scope: string;
}

interface OAuthResult {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// Generate PKCE code verifier
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Generate PKCE code challenge from verifier
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Generate random state
function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

// Find an available port
function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
    server.on('error', reject);
  });
}

// Perform OAuth with loopback server
async function performLoopbackOAuth(config: OAuthConfig): Promise<OAuthResult> {
  const port = await findAvailablePort();
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  return new Promise((resolve, reject) => {
    let server: http.Server | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    };

    // Set timeout (3 minutes)
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('OAuth timed out'));
    }, 3 * 60 * 1000);

    server = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url || '', true);

      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.query.code as string;
        const returnedState = parsedUrl.query.state as string;
        const error = parsedUrl.query.error as string;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h2>Authentication Failed</h2>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          cleanup();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (returnedState !== state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h2>Authentication Failed</h2>
                <p>State mismatch - possible CSRF attack.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          cleanup();
          reject(new Error('State mismatch'));
          return;
        }

        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h2>Authentication Failed</h2>
                <p>No authorization code received.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          cleanup();
          reject(new Error('No authorization code'));
          return;
        }

        // Exchange code for tokens
        try {
          const tokenResponse = await exchangeCodeForTokens(
            code,
            config.clientId,
            redirectUri,
            codeVerifier,
            config.clientSecret
          );

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h2>Authentication Successful!</h2>
                <p>You can close this window and return to the app.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);

          cleanup();
          resolve(tokenResponse);
        } catch (tokenError) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h2>Authentication Failed</h2>
                <p>Failed to exchange authorization code.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          cleanup();
          reject(tokenError);
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(port, '127.0.0.1', () => {
      // Build OAuth URL
      const authParams = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: config.scope,
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: state,
      });

      const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;

      // Open system browser
      shell.openExternal(authUrl);
    });

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
  clientSecret?: string
): Promise<OAuthResult> {
  const params = new URLSearchParams({
    client_id: clientId,
    code: code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  // Add client_secret if provided (some desktop OAuth clients require it)
  if (clientSecret) {
    params.append('client_secret', clientSecret);
  }

  console.log('[OAuth] Exchanging code for tokens...');
  console.log('[OAuth] Client ID:', clientId);
  console.log('[OAuth] Redirect URI:', redirectUri);
  console.log('[OAuth] Code verifier length:', codeVerifier.length);
  console.log('[OAuth] Client secret provided:', !!clientSecret);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OAuth] Token exchange failed:', response.status, errorText);

    // Try to parse as JSON for more details
    try {
      const errorJson = JSON.parse(errorText);
      console.error('[OAuth] Error details:', JSON.stringify(errorJson, null, 2));
      throw new Error(`Token exchange failed: ${errorJson.error} - ${errorJson.error_description || errorText}`);
    } catch {
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }
  }

  const data = await response.json();
  console.log('[OAuth] Token exchange successful');

  if (!data.access_token) {
    throw new Error('No access token in response');
  }

  return data as OAuthResult;
}

// Register IPC handlers
export function registerOAuthLoopbackHandlers(): void {
  ipcMain.handle('oauth-loopback:authenticate', async (_event, config: OAuthConfig) => {
    try {
      const result = await performLoopbackOAuth(config);
      return { success: true, tokens: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
