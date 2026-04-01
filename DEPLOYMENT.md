# Spotify Mix Graph Deployment Guide

This project is now configured to store each user's graph in Firebase Realtime Database under:

- `graphs/{uid}/data`

That means each signed-in Firebase user gets a private graph.

## What Is Already Done In Code

- Graph writes are scoped by Firebase Auth user ID.
- Graph reads/listeners are scoped by Firebase Auth user ID.
- Graph data is cleared on sign-out.

Relevant implementation: `app.js`.

## Steps You Must Do Manually (Console/Account Actions)

These actions require your own cloud accounts and cannot be completed from this editor session.

## 1) Firebase Project Setup

1. Open Firebase Console and select your project.
2. Enable Authentication providers:
   - Google (required for account-based graph ownership)
3. Add your production domain to Authorized Domains.
4. In Realtime Database, set Rules to user-private access.

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

## 2) Spotify Developer App Setup

1. Open Spotify Developer Dashboard.
2. Select your app (or create one).
3. Add Redirect URIs for every environment you use:
   - Local dev: `http://localhost:8000`
   - Production: `https://your-domain.com`
4. Keep the Client ID in `app.js` (`SPOTIFY_CLIENT_ID`).

## 3) Update Firebase Config (if needed)

If you switch Firebase projects, replace `firebaseConfig` values in `app.js` with your new project config.

## 4) Host The App

This is a static site, so you can deploy to:

- Firebase Hosting
- Vercel
- Netlify
- GitHub Pages (if OAuth redirect URI is configured correctly)

Important: whatever host/domain you use must be:

- added in Firebase Auth Authorized Domains
- added in Spotify Redirect URIs

## 5) Post-Deploy Smoke Test

1. Open site in browser A and sign in with Google account A.
2. Connect Spotify and add transitions.
3. Open site in browser B (or incognito) and sign in with Google account B.
4. Confirm account B does not see account A graph.
5. Sign back in as account A and confirm A graph is still there.

## Notes

- Spotify auth in this app is for track search/API usage.
- Firebase auth is the identity used for graph ownership.
- This is the simplest and most reliable architecture for your current stack.
