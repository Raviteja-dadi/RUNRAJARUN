export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '2b238a62a8c44430932fe1ea78e01477';
  
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(400).json({ 
      error: 'missing_credentials',
      message: 'SPOTIFY_CLIENT_ID is not configured in Vercel environment variables.' 
    });
  }

  const origin = req.query.origin || 'https://runrajarun-18.vercel.app';
  const cleanOrigin = origin.replace(/\/+$/, '');
  const redirectUri = req.query.redirect_uri || 'https://runrajarun-18.vercel.app/auth/callback';

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
    show_dialog: 'true'
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  res.status(200).json({ url: authUrl, redirectUri });
}
