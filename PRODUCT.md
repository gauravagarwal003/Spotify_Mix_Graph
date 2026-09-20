# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Music enjoyers who like mixing on Apple Music or Spotify and want a personal way to track good transitions, remember mixes, and turn those discoveries into better playlists.

## Product Purpose

Spotify Mix Graph is a personal music journal for mapping song-to-song transitions. It helps users save mixes, discover new combinations, and browse their saved graph as material for mixed playlists.

## Positioning

The product treats mix ideas as a graph rather than a flat playlist: every saved transition becomes navigable memory for future listening and playlist building.

## Operating Context

Users search song metadata, add transitions between two tracks, optionally attach a screenshot, and revisit the graph to find related songs and paths. Authentication protects editing and syncs a user-owned graph.

## Capabilities and Constraints

- Keep the existing Firebase authentication behavior unchanged.
- Keep account-scoped graph storage and syncing.
- Keep Spotify-backed catalog search through the Cloudflare Pages Function.
- Keep the graph as the primary workspace.
- The app should support signed-out guidance and catalog search, with signed-in graph loading and editing.

## Brand Commitments

The product name is Spotify Mix Graph. The current implementation uses a dark music-app environment and green accent language; future redesigns may evolve the visual identity but should preserve the app's music-journal purpose and not alter authentication behavior.

## Evidence on Hand

- Existing static web app: `index.html`, `style.css`, `app.js`.
- Existing graph data shape and UI behavior in `app.js`.
- Cloudflare Pages Function for music search: `functions/api/spotify-search.js`.
- No real testimonials, usage metrics, brand imagery, or external proof assets are present in the repository.

## Product Principles

- Make mix capture feel immediate and low-friction.
- Treat the graph as a living memory surface, not a background decoration.
- Keep user ownership obvious: edits belong to the signed-in account.
- Favor discovery and return visits over one-off data entry.
- Preserve trust by keeping auth and server credential handling stable.
