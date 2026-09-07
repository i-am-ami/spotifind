import dotenv from 'dotenv';
dotenv.config({ override: true });

import fs from 'fs';
import http from 'http';
import open from 'open';
import SpotifyWebApi from 'spotify-web-api-node';

const TOKEN_PATH = new URL('../data/tokens.json', import.meta.url);
const SCOPES = ['user-library-read', 'playlist-read-private', 'playlist-read-collaborative'];

function loadCachedTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function runAuthFlow(spotifyApi) {
  return new Promise((resolve, reject) => {
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    const url = new URL(redirectUri);
    const port = Number(url.port) || 80;
    const callbackPath = url.pathname;

    const authUrl = spotifyApi.createAuthorizeURL(SCOPES, null, true);

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://${req.headers.host}`);
        if (reqUrl.pathname !== callbackPath) {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h2>Authorization failed: ${error}</h2>`);
          server.close();
          reject(new Error(`Spotify authorization error: ${error}`));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Authorization complete. You can close this tab.</h2>');
        server.close();

        const data = await spotifyApi.authorizationCodeGrant(code);
        const tokens = {
          access_token: data.body.access_token,
          refresh_token: data.body.refresh_token,
          expires_at: Date.now() + data.body.expires_in * 1000,
        };
        saveTokens(tokens);
        resolve(tokens);
      } catch (err) {
        reject(err);
      }
    });

    server.on('error', reject);

    server.listen(port, () => {
      console.log('Opening browser for Spotify authorization...');
      open(authUrl);
    });
  });
}

/**
 * Returns an authenticated SpotifyWebApi instance, using a cached
 * refresh token if available, or running the full browser auth flow
 * if not (or if the refresh fails).
 */
export async function getSpotifyApi() {
  const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  });

  const cached = loadCachedTokens();

  if (cached?.refresh_token) {
    try {
      spotifyApi.setRefreshToken(cached.refresh_token);
      const data = await spotifyApi.refreshAccessToken();
      spotifyApi.setAccessToken(data.body.access_token);
      saveTokens({
        access_token: data.body.access_token,
        refresh_token: cached.refresh_token,
        expires_at: Date.now() + data.body.expires_in * 1000,
      });
      return spotifyApi;
    } catch (err) {
      console.log('Cached refresh token invalid, re-authorizing...');
    }
  }

  const tokens = await runAuthFlow(spotifyApi);
  spotifyApi.setAccessToken(tokens.access_token);
  spotifyApi.setRefreshToken(tokens.refresh_token);
  return spotifyApi;
}

// Allow running directly (`npm run auth`) just to test/refresh login.
if (import.meta.url === `file://${process.argv[1]}`) {
  getSpotifyApi()
    .then(() => console.log('Authenticated successfully. Tokens cached in data/tokens.json'))
    .catch((err) => {
      console.error('Auth failed:', err);
      process.exit(1);
    });
}