---
name: Spotify Mix Graph
description: Personal transition journal for mix ideas and playlist discovery.
colors:
  box-board: "#b76535"
  box-board-mid: "#b96535"
  box-board-dark: "#7c3f22"
  box-board-light: "#d89a62"
  box-board-glow: "#d28c55"
  label: "#fff7e8"
  label-bright: "#fffaf0"
  label-warm: "#f7dfbd"
  label-aged: "#f6ead8"
  label-board-pale: "#f2dfc6"
  label-chip: "#f4d5a7"
  label-danger: "#ffe8de"
  label-danger-strong: "#ffe0d6"
  ink: "#17140f"
  ink-soft: "#574b3c"
  ink-muted: "#82664d"
  graph-ink: "#10151a"
  graph-fallback: "#1b1b1b"
  graph-panel: "#151b21"
  accent-green: "#2ed760"
  accent-green-legacy: "#1db954"
  accent-blue: "#49a7ff"
  accent-yellow: "#ffc844"
  accent-red: "#d94b3d"
  accent-red-legacy: "#f44336"
  danger-ink: "#732014"
  danger-ink-alt: "#742016"
  neutral-light: "#fff"
  neutral-rule: "#333"
  neutral-muted: "#b3b3b3"
  google-blue: "#4285F4"
  google-green: "#34A853"
  google-yellow: "#FBBC05"
  google-red: "#EA4335"
  header-shadow: "rgba(51, 29, 12, 0.16)"
  graph-overlay: "rgba(14, 17, 18, 0.68)"
effects:
  header-shadow: "rgba(51, 29, 12, 0.16)"
  graph-overlay: "rgba(14, 17, 18, 0.68)"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.015em"
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    letterSpacing: "0.04em"
  scale:
    micro: "12px"
    xxs: "0.77rem"
    xs: "0.78rem"
    sm: "0.82rem"
    sm-plus: "0.83rem"
    compact: "0.84rem"
    compact-plus: "0.85rem"
    note: "0.86rem"
    body-sm: "0.9rem"
    body: "0.92rem"
    input: "0.94rem"
    control: "0.96rem"
    label: "1rem"
    title: "1.1rem"
    zoom-control: "1.35rem"
    mobile-display: "1.45rem"
    display-min: "1.5rem"
    drawer-title: "1.55rem"
    modal-title: "1.6rem"
    display-max: "2.25rem"
    watermark-min: "3.2rem"
    watermark-max: "9rem"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  cover: "10px"
spacing:
  xs: "7px"
  sm: "10px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "11px 12px"
  panel:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "20px"
---

# Design System: Spotify Mix Graph

## Overview

**Creative North Star: "The Crate Archive"**

Spotify Mix Graph should feel like a personal box of transition notes: tactile, inspectable, and a little obsessive in the best music-collector way. The graph is the dark working board; the sidebar is the paper label pulled from the crate, where a user files new transitions and reads the journal.

The system avoids generic streaming-app glass and neon. It uses cardboard board, cream labels, black ink, and sharp accent chips to make saved mixes feel owned and catalogued.

**Key Characteristics:**
- Tactile label panels over a dark graph workspace.
- Condensed display type for archive labels and controls.
- Strong black strokes, small radii, and offset shadows.
- Header mark uses the same node-link artwork as the browser favicon.
- Green remains the active action color, supported by blue and yellow graph states.

## Colors

The palette pairs cardboard warmth with a dark graph canvas and three functional music-state accents.

### Primary
- **Crate Green** (#2ed760): Primary actions, active nav, selected graph states.

### Secondary
- **Cue Blue** (#49a7ff): Incoming graph relationships and cool state emphasis.
- **Beat Yellow** (#ffc844): Outgoing graph relationships and path emphasis.

### Neutral
- **Label Paper** (#fff7e8): Main sidebar panels, inputs, buttons, and modal surfaces.
- **Warm Label Shadow** (#f7dfbd): Panel depth and paper variation.
- **Label Age** (#f6ead8), **Bright Label** (#fffaf0), and **Label Chip** (#f4d5a7): Supporting paper tones for inputs, search results, and compact tags.
- **Pale Board Label** (#f2dfc6): The warm page-gradient endpoint.
- **Board Cardboard** (#b76535): Page ground and crate material.
- **Board Glow** (#d28c55) and **Board Mid** (#b96535): Background tonal ramp for the page material.
- **Archive Ink** (#17140f): Primary text, borders, and drawn controls.
- **Soft Ink** (#574b3c): Secondary explanatory copy.
- **Muted Ink** (#82664d) and **Neutral Muted** (#b3b3b3): Tertiary and empty-state text.
- **Graph Ink** (#10151a): Main graph canvas background.
- **Danger Paper** (#ffe8de / #ffe0d6), **Danger Ink** (#732014 / #742016), and **Legacy Alert Red** (#f44336): Error and unavailable states.
- **Google Identity Colors** (#4285F4, #34A853, #FBBC05, #EA4335): Preserved only inside the Google sign-in mark.

### Named Rules
**The Label Paper Rule.** Controls and panels should feel printed or stamped, not glassy. Use hard ink strokes and plain paper fills before blur, translucency, or repeated graph textures.

## Typography

**Display Font:** Barlow Condensed  
**Body Font:** IBM Plex Sans

**Character:** Condensed labels give the interface a crate-end, liner-note quality. Body copy stays human and readable, like a personal journal note rather than a dashboard.

### Hierarchy
- **Display** (700, `clamp(1.5rem, 1.15rem + 1.2vw, 2.25rem)`, 0.92): Product name and panel headings.
- **Title** (700, 1rem-1.1rem): Journal step headings and section labels.
- **Body** (400, 0.92rem, 1.45): Explanatory copy and detail text.
- **Label** (700, 1rem, 0.04em): Form labels and compact controls.
- **Microcopy** (0.77rem-0.86rem or 12px): Search hints, auth notices, and compact empty states.
- **Interface Titles** (1.1rem, 1.45rem, 1.55rem, 1.6rem): Drawer, mobile, and modal title steps.
- **Watermark** (3.2rem-9rem): Oversized graph-canvas background label.

## Layout

Desktop uses a full-bleed graph canvas with a single floating label panel anchored top-left. Mobile stacks the label panel above the graph, centers the header/navigation, and exposes a View Graph control with a Show Card recovery handle when the graph has taken over the viewport. When no private graph is loaded, the canvas shows a clear label-paper empty state instead of an unexplained blank grid. Spacing is dense but not cramped: form groups use 15px gaps, account explanation rows use 10px gaps, and panel padding is 20px on desktop and 16px on mobile.

## Elevation & Depth

Depth is physical and printed: panels and controls use offset ink shadows, not soft glowing halos. The graph canvas remains flat and spacious so album-cover nodes become the visual activity.

### Shadow Vocabulary
- **Panel lift** (`0 18px 32px rgba(22, 13, 7, 0.2), 6px 6px 0 rgba(23, 20, 15, 0.76)`): Main label panels.
- **Control stamp** (`3px 3px 0 rgba(23, 20, 15, 0.88)`): Primary form actions only. Top navigation tabs stay flat.

## Shapes

Corners stay small and utilitarian: 4px for very small chips, 6px for controls and internal rows, 8px for major paper panels, and 10px for album-art previews. Borders are usually 2px black ink. Avoid pills except where inherited browser or auth controls require a compact affordance.

## Components

### Buttons
- **Shape:** Small-radius stamped rectangles (6px).
- **Primary:** Crate Green fill, black text, black stroke, hard offset shadow.
- **Secondary:** Label Paper fill, black stroke, lighter offset shadow.
- **Hover / Focus:** Hover fills inside a fixed 2px border; focus uses a green ring.
- **Selection Actions:** Hide selection-clearing controls until a graph song is actively selected.

### Panels
- **Style:** Plain Label Paper with no inner rectangle. Do not use graph grids or graph-paper texture inside cards.
- **Depth:** Hard offset shadow plus light ambient shadow.
- **Internal Padding:** 20px desktop, 16px mobile.

### Inputs / Fields
- **Style:** Label Paper fill, 2px black stroke, 6px radius.
- **Focus:** Warmer paper fill and Crate Green focus ring.

### Navigation
- **Style:** Flat label buttons in the top bar, no offset shadow.
- **Hover:** No animation. The background may change instantly, and the 2px black border must not move, scale, or visually shrink.
- **Active State:** Crate Green fill.
- **Mobile:** Labels shorten through existing `data-short` behavior; View Graph remains visible.

### Graph Canvas
- **Style:** Dark ink field with a measured grid because the graph is the working surface. Do not add a text watermark.
- **Empty State:** If there are no nodes, show a label-paper message that explains whether the app is loading, signed out, or waiting for the first transition.
- **Nodes:** Album artwork with cream borders and cream labels.
- **Relationships:** Cardboard default edges; blue incoming paths; yellow outgoing paths. Default arrangement uses a spacious force-cluster layout to avoid tree-like rows and reduce crossings.
- **Controls:** Zoom in/out controls live on the desktop graph canvas as compact square buttons; hide them on mobile.
- **Details Lists:** Incoming and outgoing related-song rows include a mini album cover, title, and artist.
- **Transition Details:** Edge-click transition views use album-cover cards for both the From and To tracks.

## Do's and Don'ts

### Do:
- **Do** keep the graph canvas dark and spacious.
- **Do** use cream label surfaces for controls and notes.
- **Do** keep graph-grid texture on the graph canvas only.
- **Do** match the header mark to the favicon artwork.
- **Do** include mini album covers in Incoming From and Outgoing To song rows.
- **Do** show album covers, titles, and artists for both sides of a transition.
- **Do** hide Deselect Highlight until a song is selected.
- **Do** preserve small-radius, ink-stroked controls.
- **Do** use green only for action or active state.

### Don't:
- **Don't** introduce glassmorphism, neon glows, or generic streaming-app chrome.
- **Don't** put graph grids or graph-paper textures on cards, panels, or modals.
- **Don't** draw an inner rectangle around card or panel text.
- **Don't** place “Mix Graph” or other watermark text in the graph background.
- **Don't** show a Clear button inside the song details drawer.
- **Don't** add a tagline under the app name in the header.
- **Don't** add a first-run modal when the Account panel already explains the flow.
- **Don't** change Firebase auth behavior as part of visual work.
