![FONY](https://github.com/user-attachments/assets/c11d64c3-9355-4d07-9be4-3cc3aa3841fe)

# FONY — Web3 Music Player & Free Internet Radio

**FONY** is a browser-based music player that combines free internet radio streaming with Web3 NFT audio playback, an AI console, and a set of discovery/customization tools — all in a single static web app.

🔗 **Live app:** https://fony.fun

---

## Table of Contents

- [Features](#features)
  - [Radio Streaming](#radio-streaming)
  - [Genres & Playlists](#genres--playlists)
  - [Web3 / NFT Audio](#web3--nft-audio)
  - [AI Console](#ai-console)
  - [Now Playing & Metadata](#now-playing--metadata)
  - [Equalizer & Visualizers](#equalizer--visualizers)
  - [Favorites & Collection](#favorites--collection)
  - [Theming & Skins](#theming--skins)
  - [Settings & Data Backup](#settings--data-backup)
  - [Fonypedia](#fonypedia)
- [Architecture](#architecture)
- [Running Locally](#running-locally)
- [Known Limitations](#known-limitations)
- [License & Trademark](#license--trademark)

---

## Features

### Radio Streaming

- 24/7 internet radio across dozens of genre-based stations, streamed directly in the browser — no account, no subscription.
- Live ICY now-playing metadata (artist/track) polled for the active station, with a buffering indicator while a stream connects.
- Automatic stall detection and recovery: the player monitors real audio output (not just playback time) and auto-skips to the next station if a stream goes dead, hiding stations that repeatedly fail.
- A dedicated iOS playback path relays streams through an HLS proxy, since Safari on iOS doesn't handle some ICY/AAC streams directly.
- Global search across every genre's station list, shuffle, next/previous, and a "Random" button that jumps to a random genre and station.
- Shareable deep links to a specific station (`#Genre/<hash>`) and URL-based genre entry (e.g. visiting `/techno` auto-plays that genre).
- Session persistence — the last-played station, genre, and mode are restored on reload.

### Genres & Playlists

- Dozens of built-in genre stations (electronic, house, techno, jazz, hip-hop, reggae, classical, world, and more), each backed by a plain M3U playlist.
- **Add your own playlist:** paste any M3U URL (including GitHub blob links, auto-converted to raw URLs), or browse a large third-party community M3U catalog directly from the app.
- Custom playlists are saved locally in your browser and appear alongside built-in genres, with their own delete controls.

### Web3 / NFT Audio

- Connect a MetaMask-compatible wallet to browse and stream audio from a small, curated set of NFT collections spanning Ethereum mainnet and Soneum.
- Track metadata (audio file, cover art, title, artist) is read from each token's on-chain metadata URI, with `ipfs://` and `ar://` links resolved through public IPFS/Arweave gateways.
- NFT tracks play through the same player UI as radio, but support real seeking/scrubbing since they have a fixed duration (unlike a live stream).
- A Random button in Web3 mode picks a random collection and track; the last-played NFT track is restored on reload.

> **Note:** this is a small allowlist of hand-picked collections, not general "connect any NFT" support, and playback is not currently gated by verified on-chain ownership for every collection — treat it as a curated Web3 audio showcase rather than a wallet-gated members-only feature.

### AI Console

An in-app chat console offers several slash-commands, backed by an external API:

| Command | What it does |
|---|---|
| `/similar` | Suggests similar tracks to what's currently playing |
| `/facts` | Shares quick facts about the current artist/track |
| `/discogs [query]` | Looks up album/year/label/genre info via Discogs, with cover art and streaming search links |
| `/mood` | Describe a mood or vibe (e.g. "90s rock", "something chill") and get matched to a live station currently playing something that fits |
| `/collection` | Save the currently playing track to a personal list, and get AI recommendations based on it |
| `/equalizer [genre]` | Apply a genre-tuned EQ preset, or toggle an "Analog FX" mode that simulates old-radio warmth |
| `/skins` | Generate a random procedural background pattern for the player, or use the current track's album art as a skin |
| `/donate` | Shows crypto donation addresses |

The console also runs a rotating "tips" walkthrough of app features on first use.

### Now Playing & Metadata

- Discogs-derived album info (year, country, label, genre) and cover art shown automatically as the track changes.
- Cover art displayed as an animated rotating record/CD/reel behind the play button, with a manual toggle between placeholder art styles.
- Media Session API integration — lock-screen and OS-level media controls (play/pause/next/previous, title/artist) on supported platforms.

### Equalizer & Visualizers

- Five selectable real-time frequency visualizer styles (bars, line, "fish", lava, sheep), driven by the Web Audio API's analyser node.
- A separate, genuine 3-band audio equalizer (low/mid/high) with per-genre presets, adjustable manually or via the `/equalizer` chat command.

### Favorites & Collection

- **Favorites** — heart any station to pin it; sort favorites by custom drag order, date added, genre, or alphabetically, with full drag-and-drop reordering.
- **Collection** — a separate, chat-driven list of manually saved tracks (by artist/title, not stream URL), used to power AI recommendations.

### Theming & Skins

- Light/dark theme toggle with a matching icon set for each mode.
- Procedurally generated background "skins" (see `/skins` above) layered independently on top of the light/dark theme.

### Settings & Data Backup

Accessible from the About/manifesto panel:

- Hide non-HTTPS stations.
- Left-handed layout (mirrors the UI on wide viewports).
- Backup the app's local data to a JSON file, restore from a backup, or fully reset the app.

### Fonypedia

A standalone genre encyclopedia (`/fonypedia`) with a static reference page for each major genre — browsable independently of the player itself.

---

## Architecture

FONY is a **static, vanilla JavaScript web app** — no framework, no bundler, no build step, no `package.json`. `index.html` loads ES modules directly (`js/main.js` as the entry point), which import the rest of the app (`player.js`, `playlist.js`, `chat.js`, `web3.js`, etc.).

- **Hosting:** deployed on Netlify as a static site; `_redirects` provides SPA-style catch-all routing so deep links like `/techno` resolve to the app.
- **Data:** genre stations are plain `.m3u` playlists in [genres/](genres/), indexed by [json/playlists.json](json/playlists.json).
- **Backend:** dynamic functionality (AI chat, stream proxying for mixed-content/iOS HLS relay, Discogs lookups) is handled by an external API service, not included in this repository. The one Netlify serverless function in this repo ([netlify/functions/get-config.js](netlify/functions/get-config.js)) is currently a stub.
- **Web3:** wallet connectivity and contract reads use `ethers.js`, loaded from a CDN at runtime.
- **External services used:** Discogs (via backend proxy), public IPFS/Arweave gateways, GitHub's API (for the community playlist browser), and Google Analytics (for basic usage stats).

## Running Locally

This is a static site with no install step. Serve the repository root with any static file server — opening `index.html` directly via `file://` will break, since the app fetches JSON/M3U files at runtime.

```bash
# any of the following work:
npx serve .
python -m http.server 8000
# or, since a netlify.toml is present:
netlify dev
```

Then open the served URL in your browser. AI console, Discogs lookups, and stream proxying rely on the external backend service and require network access to it.

## Known Limitations

- The AI console, stream proxy, and Discogs lookups depend on an external backend service not included in this repository, so their behavior can't be fully controlled or audited from this codebase alone.
- Web3 playback is a curated allowlist of a few NFT collections, not a general-purpose NFT player, and ownership is not strictly enforced for playback on every collection.
- A couple of features present in the code (podcast narration, album-art lookup via MusicBrainz) are currently disabled in the UI and not user-reachable.

## License & Trademark

- Code is licensed under **AGPL-3.0** — see [LICENSE](LICENSE). If you host a modified version, you must make your source available to its users.
- The **FONY name, logo, and original visual/UI design** are trademarked by Block Ark Studios and are **not** covered by the AGPL grant — see [TRADEMARK.md](TRADEMARK.md). Forks must rebrand unless given written permission; referring to your fork as "based on FONY" is fine.
- See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community guidelines.

---

© 2026 Block Ark Studios
