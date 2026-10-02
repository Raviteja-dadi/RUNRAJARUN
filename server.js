import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root directory
app.use(express.static(__dirname));

// --- SPOTIFY OAUTH CONFIGURATION ---
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '2b238a62a8c44430932fe1ea78e01477';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

// 1. Get Spotify Authorization URL
app.get('/api/spotify/url', (req, res) => {
  const origin = req.query.origin || 'https://runrajarun-18.vercel.app';
  const cleanOrigin = origin.replace(/\/+$/, '');
  const redirectUri = req.query.redirect_uri || 'https://runrajarun-18.vercel.app/auth/callback';
  
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(400).json({ 
      error: 'missing_credentials',
      message: 'SPOTIFY_CLIENT_ID is not configured in the server environment.' 
    });
  }

  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'user-read-email',
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    show_dialog: 'true' // always show dialog to make switching accounts easy
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  res.json({ url: authUrl, redirectUri });
});

// 2. Direct Token Exchange Endpoint
app.post('/api/spotify/exchange', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'missing_code', message: 'Authorization code is required.' });
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'missing_credentials', message: 'Spotify credentials missing on server.' });
  }

  const origin = req.protocol + '://' + req.get('host');
  const redirectUri = redirect_uri || `${origin}/auth/callback`;

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.toString(),
        redirect_uri: redirectUri
      })
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json(tokens);
    }

    res.json(tokens);
  } catch (err) {
    console.error('Error during token exchange:', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// 3. Spotify OAuth Callback Page Handler
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, error } = req.query;
  const origin = req.protocol + '://' + req.get('host');
  const redirectUri = req.query.redirect_uri || `${origin}/auth/callback`;

  if (error) {
    return res.send(renderAuthResultPage(false, `Spotify Authorization Error: ${error}`));
  }

  if (!code) {
    // If accessed statically without query parameters, serve the static html file
    return res.sendFile(join(__dirname, 'auth', 'callback', 'index.html'));
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return res.send(renderAuthResultPage(false, 'Spotify API credentials (SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET) are missing on the server. Please configure them in environment variables.'));
  }

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.toString(),
        redirect_uri: redirectUri
      })
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.send(renderAuthResultPage(false, tokens.error_description || tokens.error || 'Failed to exchange code for access tokens.'));
    }

    // Return the successful page, passing the tokens to the opener via postMessage & storage
    return res.send(renderAuthResultPage(true, null, tokens));

  } catch (err) {
    console.error('Error during Spotify token exchange:', err);
    return res.send(renderAuthResultPage(false, `Internal Server Error: ${err.message}`));
  }
});

// 3. Spotify Token Refresh Endpoint
app.post('/api/spotify/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'missing_refresh_token', message: 'Refresh token is required.' });
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'missing_credentials', message: 'Spotify credentials are missing on the server.' });
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token || refresh_token // Spotify may return a new refresh token, otherwise reuse existing
    });

  } catch (err) {
    console.error('Error refreshing Spotify token:', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Helper function to render a beautiful OAuth callback landing page
function renderAuthResultPage(success, errorMessage = null, tokens = null) {
  const tokensJson = tokens ? JSON.stringify(tokens) : 'null';
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Spotify Connection - Run Raja Run</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@500;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Rajdhani', sans-serif; background-color: #0c0501; }
        .orbitron { font-family: 'Orbitron', sans-serif; }
      </style>
    </head>
    <body class="flex items-center justify-center min-h-screen text-stone-200 p-6">
      <div class="max-w-md w-full border border-amber-500/30 bg-stone-950 rounded-2xl p-8 shadow-2xl text-center space-y-6">
        
        <!-- Logo Header -->
        <div class="flex flex-col items-center gap-2">
          <div class="w-16 h-16 rounded-full bg-stone-900 border-2 border-[#1DB954] flex items-center justify-center text-3xl text-[#1DB954]">
            🎵
          </div>
          <h2 class="text-2xl font-black orbitron uppercase tracking-wider text-white mt-3">
            Spotify Connector
          </h2>
          <div class="w-12 h-[1px] bg-amber-500/30"></div>
        </div>

        ${success ? `
          <!-- Success State -->
          <div class="space-y-4">
            <div class="bg-emerald-950/40 border border-[#1DB954]/50 rounded-xl p-4 text-emerald-300">
              <span class="text-3xl block mb-1">🎉</span>
              <p class="font-extrabold text-sm orbitron uppercase tracking-wide">CONNECTION SUCCESSFUL!</p>
              <p class="text-xs text-stone-300 mt-1">Run Raja Run is now connected to Spotify.</p>
            </div>
            <p class="text-stone-400 text-xs">This window will close automatically in a moment. Enjoy the ancient vibes and supersonic beats!</p>
            <script>
              const tokensData = ${tokensJson};
              const payload = {
                type: 'OAUTH_AUTH_SUCCESS', 
                tokens: tokensData,
                timestamp: Date.now()
              };

              // 1. PostMessage
              try {
                if (window.opener) {
                  window.opener.postMessage(payload, '*');
                }
              } catch(e) {
                console.warn('PostMessage error:', e);
              }

              // 2. BroadcastChannel
              try {
                if ('BroadcastChannel' in window) {
                  const bc = new BroadcastChannel('spotify_oauth_channel');
                  bc.postMessage(payload);
                }
              } catch(e) {}

              // 3. LocalStorage fallback
              try {
                localStorage.setItem('spotify_oauth_result', JSON.stringify(payload));
                if (tokensData && tokensData.access_token) {
                  localStorage.setItem('spotify_access_token', tokensData.access_token);
                  if (tokensData.refresh_token) localStorage.setItem('spotify_refresh_token', tokensData.refresh_token);
                  if (tokensData.expires_in) localStorage.setItem('spotify_token_expiry', (Date.now() + (tokensData.expires_in * 1000)).toString());
                }
              } catch(e) {}

              setTimeout(() => {
                try {
                  if (window.opener) {
                    window.close();
                  } else {
                    document.getElementById('manual-btn').classList.remove('hidden');
                  }
                } catch (e) {
                  document.getElementById('manual-btn').classList.remove('hidden');
                }
              }, 1400);
            </script>
          </div>
        ` : `
          <!-- Error State -->
          <div class="space-y-4">
            <div class="bg-red-950/40 border border-red-500/50 rounded-xl p-4 text-red-200 text-left space-y-2">
              <div class="flex items-center gap-1.5 font-bold text-red-400">
                <span>⚠️</span>
                <span class="orbitron uppercase">CONNECTION FAILED</span>
              </div>
              <p class="text-xs text-stone-300 font-medium">${errorMessage}</p>
            </div>
            
            <div class="bg-black/30 p-4 rounded-xl border border-amber-500/10 text-left space-y-2 text-xs">
              <strong class="text-amber-400 font-bold block">🔧 RECOVERY INSTRUCTIONS:</strong>
              <p class="text-stone-300 font-medium">To use the Spotify Control Panel, ensure you configure your Spotify Client ID & Secret in the environment variables.</p>
              <p class="text-[#1DB954] font-bold">Failsafe active: You can still enjoy music in the game using our high-fidelity Spotify Iframe Embed Player right away!</p>
            </div>

            <button onclick="window.close()" class="w-full bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 py-2.5 rounded-xl orbitron text-xs font-bold transition-all">
              CLOSE WINDOW
            </button>
          </div>
        `}

        <button id="manual-btn" class="hidden w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold py-2.5 rounded-xl orbitron tracking-wider text-xs transition-all" onclick="window.location.href='/'">
          GO TO GAME
        </button>
      </div>
    </body>
    </html>
  `;
}

// For SPA routing, serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
