# Spotify Mix Graph Deployment Guide

This project is now configured to store each user's graph in Firebase Realtime Database under:

- `graphs/{uid}/data`

That means each signed-in Firebase user gets a private graph.

## What Is Already Done In Code

- Graph writes are scoped by Firebase Auth user ID.
- Graph reads/listeners are scoped by Firebase Auth user ID.
- Graph data is cleared on sign-out.
- Spotify catalog search runs through a Firebase Function; visitors do not need Spotify login.
- Spotify credentials are stored as Firebase Functions secrets and never sent to the browser.
- Uploaded screenshots are restricted to image files under 2 MB before they are stored with graph data.
- API-derived text and image URLs are escaped and restricted to HTTPS images before rendering.

Relevant implementation: `app.js`.

## Steps You Must Do Manually (Console/Account Actions)

These actions require your own cloud accounts and cannot be completed from this editor session.

## 1) Firebase Project Setup

1. Open Firebase Console and select your project.
2. Enable Authentication providers:
   - Google (required for account-based graph ownership)
3. Add your production domain to Authorized Domains.
4. In Realtime Database, set Rules to user-private access.

Do not use Firebase Test mode in production. Firebase web configuration values are not server secrets, but the API key should still be restricted in Google Cloud to the required APIs and your production referrers.

Use these Realtime Database rules:

```json
{
  "rules": {
    "graphs": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

## 2) Configure Spotify Server Credentials

### Free Hosting: Cloudflare Pages

The Spotify proxy is implemented as a Cloudflare Pages Function in
`functions/api/spotify-search.js`. Cloudflare Pages can host the static app and
this `/api/spotify-search` endpoint together, so Firebase Blaze billing is not
required.

Create a free Cloudflare account, install Wrangler, and authenticate:

```bash
npm install --global wrangler
wrangler login
```

Create a Pages project and store the Spotify credentials as encrypted secrets:

```bash
wrangler pages project create mixgraph
wrangler pages secret put SPOTIFY_CLIENT_ID --project-name mixgraph
wrangler pages secret put SPOTIFY_CLIENT_SECRET --project-name mixgraph
```

Deploy from the project root:

```bash
wrangler pages deploy . --project-name mixgraph
```

Cloudflare will provide a free `*.pages.dev` URL. Firebase Authentication must
have that exact hostname added to Authorized Domains.

Create or use a Spotify Developer App and copy its **Client ID** and **Client
Secret**. This integration uses Spotify's Client Credentials flow for public
catalog search. It does not use your personal Spotify account, playlists, or
refresh token.

The CLI prompts for each value. Never put either value in `app.js`, commit them
to Git, or paste them into Firebase web configuration.

## 3) Update Firebase Config (if needed)

If you switch Firebase projects, replace `firebaseConfig` values in `app.js` with your new project config.

## 4) Hosting

Use the generated Cloudflare Pages `*.pages.dev` URL. Add that exact hostname
to Firebase Authentication's Authorized Domains. A custom domain is optional.

Cloudflare Pages provides HTTPS automatically. In Cloudflare Dashboard, open
the Pages project, go to **Settings > Domains**, and enable **Always Use HTTPS**
if it is not already enabled. The repository's [`_headers`](_headers) file
applies the CSP and browser security headers on the next deployment.

After deployment, verify them with:

```bash
curl -sSI https://mixgraph.pages.dev/ | grep -iE '^(HTTP/|location:|content-security-policy:|referrer-policy:|x-content-type-options:|x-frame-options:|permissions-policy:|strict-transport-security:)'
curl -sSI http://mixgraph.pages.dev/ | grep -iE '^(HTTP/|location:)'
```

Pin CDN dependencies with integrity hashes or self-host them before launch. Add a custom domain only when you need branded hosting.

## 5) Local Test

To test the proxy locally, create a `.dev.vars` file in the project root (never
commit this file):

```text
SPOTIFY_CLIENT_ID=your-client-id
SPOTIFY_CLIENT_SECRET=your-client-secret
```

```bash
wrangler pages dev .
```

Open the local URL shown by Wrangler and search for a song. Do not use
`python3 -m http.server` for this test because it cannot run the Pages Function.

## 6) Secret Exposure Check

Spotify secrets should exist only in Cloudflare Pages secret storage. This
command lists secret names, never secret values:

```bash
wrangler pages secret list --project-name mixgraph
```

Run these checks before every commit. They inspect tracked files and the
deployed frontend bundle for common credential patterns:

```bash
git grep -nE 'SPOTIFY_CLIENT_SECRET|client_secret|Bearer [A-Za-z0-9._-]{20,}|AIza[0-9A-Za-z_-]{20,}' -- ':!DEPLOYMENT.md'
git ls-files --cached --others --exclude-standard | grep -E '(^|/)(\.env|\.dev\.vars|.*secret.*|.*credentials.*)' || true
curl -sS https://mixgraph.pages.dev/app.js | grep -nE 'SPOTIFY_CLIENT_SECRET|client_secret|Bearer [A-Za-z0-9._-]{20,}' || true
```

Firebase web API keys and Firebase config are public client configuration; the
Spotify Client Secret is not. If a real Spotify secret ever appears in Git or
the browser bundle, rotate it immediately in the Spotify Developer Dashboard.

## 7) Post-Deploy Smoke Test

1. Open site in browser A and sign in with Google account A.
2. Search for tracks without a streaming-provider login and add transitions.
3. Open site in browser B (or incognito) and sign in with Google account B.
4. Confirm account B does not see account A graph.
5. Sign back in as account A and confirm A graph is still there.
6. Try an invalid image type and an image over 2 MB; both must be rejected.
7. Search for a song with apostrophes or ampersands and confirm the result renders as text.
8. Open browser developer tools and confirm no Firebase request is made to another user's `graphs/{uid}` path.

## Release Checklist

- [ ] Firebase Authentication and Realtime Database rules are production-configured.
- [ ] Production domain is present in Firebase Authorized Domains.
- [ ] `_headers` is deployed and HTTPS redirects to HTTPS.
- [ ] No Spotify secret appears in Git or the deployed JavaScript.
- [ ] CDN dependencies are integrity-pinned or self-hosted.
- [ ] Backup/export and Firebase usage alerts are configured.
- [ ] The smoke test passes in a clean browser profile.

## Notes

- Firebase auth is the identity used for graph ownership.
- This is the simplest and most reliable architecture for your current stack.
