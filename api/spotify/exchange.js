export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { code, redirect_uri } = req.body || {};
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
  const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

  if (!code) {
    return res.status(400).json({ error: 'missing_code', message: 'Authorization code is required.' });
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'missing_credentials', message: 'Spotify credentials missing in environment variables.' });
  }

  const redirectUri = redirect_uri || 'https://runrajarun-18.vercel.app/auth/callback';

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

    res.status(200).json(tokens);
  } catch (err) {
    res.status(500).json({ error: 'server_error', message: err.message });
  }
}
