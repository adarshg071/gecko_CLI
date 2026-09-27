import { Command } from 'commander';
import http from 'http';
import { exec } from 'child_process';
import path from 'path';
import { loadConfig, findProjectRoot, getGeckoDir } from '../core/config.js';
import { saveIdentity, hasIdentity } from '../core/identity.js';
import { GeckoApiClient } from '../core/api.js';
import { getDb, getProviders } from '../core/db.js';
import { v4 as uuid } from 'uuid';

const GECKO_API_URL = process.env['GECKO_API_URL'] ?? 'https://gecko-ashy.vercel.app';
const SUPABASE_URL = 'https://ahubyqsnzulrzbsqyiyi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodWJ5cXNuenVscnpic3F5aXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0Mzc5ODMsImV4cCI6MjEwNjAxMzk4M30.tuTajLb_nybYyHMJKbFi8lXMcVkbRD1K00Amw6BwsDQ';
const CALLBACK_PORT = 9753;
const CALLBACK_PATH = '/auth/callback/cli';

/** Open a URL in the system browser cross-platform. */
function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? `open "${url}"` :
               process.platform === 'win32' ? `start "" "${url}"` :
               `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) process.stdout.write(`Could not open browser automatically. Please visit:\n  ${url}\n`);
  });
}

/**
 * Spin up a local HTTP server on CALLBACK_PORT.
 * Supabase will redirect to: http://localhost:9753/auth/callback/cli#access_token=...
 * The browser fragment is not sent to the server, so we serve a tiny HTML page
 * that POSTs the fragment parameters to the callback endpoint.
 */
function startCallbackServer(): Promise<{ token: string; agent_id: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for browser auth (5 minutes). Run gecko connect again.'));
    }, 5 * 60 * 1000);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`);

      // Step 1: Browser GETs the callback URL with #fragment — serve HTML that extracts the token
      if (req.method === 'GET' && url.pathname === CALLBACK_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Gecko CLI Auth</title></head>
<body>
<p>Signing you in…</p>
<script>
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (token) {
    fetch('http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ access_token: token, refresh_token: refresh })
    }).then(() => {
      document.body.innerHTML = '<h2>✓ Connected to Gecko! You can close this tab.</h2>';
    });
  } else {
    document.body.innerHTML = '<h2>Error: no access_token in URL. Please try again.</h2>';
  }
</script>
</body>
</html>`);
        return;
      }

      // Step 2: JS POSTs the token to us
      if (req.method === 'POST' && url.pathname === CALLBACK_PATH) {
        let body = '';
        req.on('data', (d: Buffer) => { body += d.toString(); });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
          server.close();
          clearTimeout(timeout);
          try {
            const data = JSON.parse(body) as { access_token?: string };
            if (!data.access_token) { reject(new Error('No access_token received')); return; }
            // Decode the JWT to get the user ID (sub claim) as agent_id
            const parts = data.access_token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString()) as { sub?: string; email?: string };
            resolve({
              token: data.access_token,
              agent_id: payload.sub ?? uuid(),
            });
          } catch (err) {
            reject(err);
          }
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is already in use. Close other apps using it and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT);
  });
}

export function registerConnectCommand(program: Command): void {
  program
    .command('connect')
    .description('Connect this machine to Gecko via GitHub login')
    .option('--token <jwt>', 'Provide a Supabase JWT directly (skip browser flow)')
    .action(async (opts: { token?: string }) => {
      const root = findProjectRoot();
      if (!root) { process.stderr.write('Not a Gecko project. Run gecko init first.\n'); process.exit(1); }

      const config = loadConfig(root);

      if (hasIdentity()) {
        process.stderr.write('Already connected. Run gecko disconnect first to reconnect.\n');
        process.exit(1);
      }

      let accessToken: string;
      let agentId: string;

      if (opts.token) {
        // Direct token mode — useful for CI or if the user already has a Supabase JWT
        accessToken = opts.token;
        const parts = accessToken.split('.');
        const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString()) as { sub?: string };
        agentId = payload.sub ?? uuid();
        process.stdout.write(`Using provided token. Agent ID: ${agentId}\n`);
      } else {
        // GitHub OAuth via browser
        const callbackUrl = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
        // Build the Supabase GitHub OAuth URL with our local callback
        const oauthUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(callbackUrl)}`;

        process.stdout.write('\n  Opening your browser to sign in with GitHub…\n');
        process.stdout.write(`\n  URL: ${oauthUrl}\n\n`);
        process.stdout.write('  If the browser does not open, copy and paste the URL above.\n');
        process.stdout.write('  Waiting for GitHub sign-in (up to 5 minutes)…\n\n');

        // Start callback server before opening browser
        const callbackPromise = startCallbackServer();
        openBrowser(oauthUrl);

        let result: { token: string; agent_id: string };
        try {
          result = await callbackPromise;
        } catch (err) {
          process.stderr.write(`Auth failed: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }

        accessToken = result.token;
        agentId = result.agent_id;
      }

      // Verify token works against the server
      const client = new GeckoApiClient({ apiUrl: config.api_url, token: accessToken });
      try {
        await client.listProjects();
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 401) {
          process.stderr.write('Token was rejected by the server. Please try again.\n');
          process.exit(1);
        }
        // Other errors (network, 5xx) — proceed anyway, token may still be valid
      }

      saveIdentity({
        agent_id: agentId,
        project_id: config.project_id,
        api_url: config.api_url,
        token: accessToken,
        created_at: new Date().toISOString(),
      });

      // Register provider capabilities (non-fatal)
      const db = getDb(getGeckoDir(root));
      const providers = getProviders(db);
      await client.registerAgent(agentId, { providers: providers.length }).catch(() => {});

      process.stdout.write(`✓ Connected!\n`);
      process.stdout.write(`  Agent ID: ${agentId}\n`);
      process.stdout.write(`  API:      ${config.api_url}\n`);
      process.stdout.write(`  Token stored at ~/.config/gecko/identity.json\n\n`);
      process.stdout.write(`Next: gecko provider add && gecko plan generate\n`);
    });
}
