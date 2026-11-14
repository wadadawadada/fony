![FONY](https://github.com/user-attachments/assets/c11d64c3-9355-4d07-9be4-3cc3aa3841fe)

# FONY — Free Internet Radio with Nostr Social Discovery

**FONY** is a browser-based music player that combines free internet radio streaming with optional Nostr social sharing of favorite stations, an AI console, and a set of discovery/customization tools — all in a single static web app.

🔗 **Live app:** https://fony.fun

---

## Table of Contents

- [Features](#features)
  - [Radio Streaming](#radio-streaming)
  - [Genres & Playlists](#genres--playlists)
  - [Nostr — Social Radio](#nostr--social-radio)
  - [Local Files](#local-files)
  - [AI Console](#ai-console)
  - [Now Playing & Metadata](#now-playing--metadata)
  - [Equalizer & Visualizers](#equalizer--visualizers)
  - [Favorites & Collection](#favorites--collection)
  - [Theming & Skins](#theming--skins)
  - [Games](#games)
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
- Global search across every genre's station list, shuffle, next/previous, and a "Random" button that jumps to a random genre and station — see [Random picks](#random-picks).
- Shareable deep links to a specific station (`#Genre/<hash>`) and URL-based genre entry (e.g. visiting `/techno` auto-plays that genre).
- Session persistence — the last-played station, genre, and mode are restored on reload.

### Random picks

The Random button learns your taste locally, per genre, without making the pick predictable:

- A station counts as a listen after 45 seconds of playback, so channel surfing doesn't skew anything. Genres you listen to more often, and genres of your favorited stations, get a higher chance.
- Every genre keeps a base chance (weights are square-rooted so a favorite can't crowd out the rest), and 1 roll in 5 ignores your taste entirely to keep discovery alive.
- It works for built-in genres and for custom playlists you've added.
- Old habits fade (weights decay about 3% per day). Everything is a tiny object in your browser's `localStorage` — nothing is sent anywhere, and there's no background work.
- **Settings → Random taste → Reset** wipes it. Favorites are left untouched (they still influence Random).

### Genres & Playlists

- Dozens of built-in genre stations (electronic, house, techno, jazz, hip-hop, reggae, classical, world, and more), each backed by a plain M3U playlist.
- **Add your own playlist:** paste any M3U URL (including GitHub blob links, auto-converted to raw URLs), or browse a large third-party community M3U catalog directly from the app.
- Custom playlists are saved locally in your browser and appear alongside built-in genres, with their own delete controls.

### Nostr — Social Radio

> **Discover music through people, not algorithms.** Nostr is an optional layer: FONY stays a free internet radio that needs no registration, and everything below is opt-in.

Click the **Nostr icon** in the top bar to open Nostr mode. If you are not signed in, the first screen is the sign-in screen (**Browse without an account** skips it). Press the icon again — it turns into a radio icon — to go back. Once signed in, your Nostr nickname is shown next to the Nostr title.

- **Sign-in.** The QR code is shown straight away: scan it with a signer app (NIP-46, e.g. Amber or nsec.app), or tap *Open signer app* on the same device and approve. Alternatives: a NIP-07 browser extension (Alby, nos2x, …) or a pasted `bunker://…` link / NIP-05 address. Browsing public lists needs no account. **FONY never sees or stores your private key**; with NIP-46 only a throw-away client key for this browser is kept locally and is deleted on logout.
- **Four tabs.** *Following* (what the people you follow are listening to, and the playlists you follow), *Shared* (favorites lists published by you and the people you follow), *Discover* (newest public lists and popular stations, with search) and *Profile* (your account, shared Favorites, "now listening", relays).
- **Share Favorites.** In *Profile* the *Share* button publishes your Favorites as a public list (NIP-51, `kind:30001`). The first publication is always your explicit action. After that, *Update* republishes the same list (stable `d` identifier), and an optional switch (*Auto-update*, on by default once a list exists) keeps it current: it is re-published after you sign in and then at most every few hours, and only when your Favorites actually changed. A list you never shared is never published, and a half-loaded catalog can never shrink it. *Unshare* sends a deletion request (NIP-09) for the list and any feed note that announced it.
- **Browse, Tune In, Import.** Open a list — from Shared, Discover, a pasted link or an `npub` — and click a station (anywhere on its card) to **Tune In**; you stay on the list and ⏮ ⏭ move through it. **Import** copies the stations into your Favorites without duplicates (stations are matched by host, port and path, so `http`/`https`, `www.` and trailing-slash variants count as the same station).
- **Follow Playlist.** Follow a list to keep it in *Following*; FONY checks the relays in the background and marks lists with a new version **New**. Lists are cached locally, so a followed list still opens when relays are down.
- **Now Listening** (NIP-38, `kind:30315`). Off by default; switch it on in *Profile*. FONY then publishes the current station and track title — in any mode except Local files, which is never published — refreshes it while you listen, updates it when the station changes and clears it when you pause or stop. Friends see a **Tune In** card for it in their *Following* tab.
- **Post to your feed (optional).** Two opt-in switches publish an ordinary note (`kind:1`) so it shows up in feeds such as Primal's: one in the Share dialog (*Post to my feed*, with the list link) and one under *Now listening* (*Post to my feed*: new station only, at most every 20 minutes, with the album art when FONY found a cover for the track).
- **Backup through Nostr.** *Settings → Data → Nostr backup* stores your local data (Favorites, playlists, settings, skins) as an encrypted NIP-78 backup on your relays: compressed and encrypted with a random AES key that only your signer can unwrap, split over several events when it is large. The Nostr sign-in itself is never included. *Restore* replaces the data on the current device after an in-app confirmation. An optional *Auto backup to Nostr* switch (off by default) backs up daily, only when something changed.
- **Links.** `https://fony.fun/#nostr/<naddr>` opens a list, `#nostr/<npub>` a profile and `#nostr/tune?s=<packed station>` plays one station. You can also paste `nostr:` links, `npub`, `nprofile` and `naddr` into the search box. The share icon on a playing Nostr station copies a tune-in link.
- **Relays.** A configurable list (`wss://` only) in *Profile → Backup and relays*, with working defaults. Every event is signature-checked before use; stream URLs are validated (public `http(s)` hosts only, no credentials), text is length-limited and rendered as plain text only.
- **Station icons.** Stations in Nostr lists show their genre icon, or the station logo when *Station icons* is on in Settings. List covers are mosaics coloured by genre with the icons of the list's most frequent genres.

The event formats FONY publishes and reads are documented in [docs/nostr-events.md](docs/nostr-events.md).

> The Nostr ostrich icon is from [mbarulli/nostr-logo](https://github.com/mbarulli/nostr-logo) (CC0).

### Header menu and search (desktop)

- Hovering an icon in the header menu slides a tooltip out of it.
- The menu can be dragged by its grip (the dots appear on hover) anywhere over the player panel; near the left or right wall it snaps there as a vertical column. The position is remembered; double-click the grip to put it back in the header.
- The search field is just a magnifier until you hover or click it, then it slides open to the left within the row.

### Local Files

- A fourth playback mode next to Genre, Favorites and Nostr: click the folder-with-plus icon in the top bar to play music straight from your computer. The icon turns into a radio icon while the mode is active — click it to go back to radio.
- **Folder library:** add folders with the picker or by dragging them onto the panel. Folders are remembered between sessions (the browser asks you to re-allow access after a restart).
- **Explorer:** browse folders and subfolders with breadcrumbs, play a single track, a folder (including subfolders) or a whole playlist, and click the active track to seek.
- **Custom playlists:** create, rename, delete, reorder and remove tracks; add any track or folder with the "+" button. Playlists are stored locally in your browser, like the rest of FONY's data.
- **Now playing:** tags (title, artist) are read from the files, and the same Discogs lookup used for radio finds the album art, falling back to the cover embedded in the file.
- **Privacy:** files are never copied or uploaded — playback uses temporary in-memory links to files on disk with read-only access. Only the text "Artist - Title" is sent to look up cover art.
- Desktop only, and requires the File System Access API (Chrome, Edge, Opera, or Brave with the flag enabled — the app shows how). Favorites remain radio-only.

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

Every 8–10 minutes (first one after ~2 minutes) a small animated "Did you know?" card with a tip from the same library appears in the console. It never interrupts typing, a game or a hidden console, doesn't repeat a tip until all were shown, and can be switched off with "Hide tips" or in Settings → Console tips.

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

### Games

A small NES-style game console, desktop only: click the gamepad icon next to the Nostr button and the console opens over the player. Games sit on a cartridge shelf and react to the music through the player's audio analyser.

- **FONY Flappy** — a bouncing vinyl flies through columns of spectrum bars; you have lives.
- **FONY Breaker** — a brick breaker with shaped levels, special bricks and power-ups; progress is saved locally.

### Settings & Data Backup

Open it from the settings icon. Options are grouped into Playback, Interface and Data:

- Hide non-HTTPS stations.
- Reset Random taste (see [Random picks](#random-picks)).
- Left-handed layout (mirrors the UI on wide viewports), station icons on/off, glass ripple effect.
- Backup the app's local data to a JSON file, restore from a backup, or fully reset the app (asks for confirmation).
- The backup covers everything stored in the browser's `localStorage`: favorites, custom and local playlists, collection, skins, Random taste, game progress and all settings. Folder access granted for Local mode lives in the browser itself and can't be exported, so on another browser or device you'll need to add those folders again.

### Fonypedia

A standalone genre encyclopedia (`/fonypedia`) with a static reference page for each major genre — browsable independently of the player itself.

---

## Architecture

FONY is a **static, vanilla JavaScript web app** — no framework, no bundler, no build step, no `package.json`. `index.html` loads ES modules directly (`js/main.js` as the entry point), which import the rest of the app (`player.js`, `playlist.js`, `chat.js`, `nostr-mode.js`, etc.).

- **Hosting:** deployed on Netlify as a static site; `_redirects` provides SPA-style catch-all routing so deep links like `/techno` resolve to the app.
- **Data:** genre stations are plain `.m3u` playlists in [genres/](genres/), indexed by [json/playlists.json](json/playlists.json).
- **Backend:** dynamic functionality (AI chat, stream proxying for mixed-content/iOS HLS relay, Discogs lookups) is handled by an external API service, not included in this repository. The one Netlify serverless function in this repo ([netlify/functions/get-config.js](netlify/functions/get-config.js)) is currently a stub.
- **Nostr:** plain WebSocket connections to user-configurable relays (`js/nostr/client.js`), no backend required. [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) is pinned and loaded from a CDN **only when Nostr mode is opened**, so people who never use Nostr download nothing extra. The pure format/validation logic in `js/nostr/format.js` is unit-tested: `node --test tests/`.
- **External services used:** Discogs (via backend proxy), public Nostr relays (only when Nostr is used), GitHub's API (for the community playlist browser), and Google Analytics (for basic usage stats).

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
- Nostr depends on public relays, which can be slow, offline or drop events. A list is only visible if at least one of your relays has it; the relay list is editable in Nostr → Profile.
- A couple of features present in the code (podcast narration, album-art lookup via MusicBrainz) are currently disabled in the UI and not user-reachable.
- Local Files mode needs the File System Access API, so it is unavailable in Firefox and Safari and on mobile browsers.

## License & Trademark

- Code is licensed under **AGPL-3.0** — see [LICENSE](LICENSE). If you host a modified version, you must make your source available to its users.
- The **FONY name, logo, and original visual/UI design** are trademarked by Block Ark Studios and are **not** covered by the AGPL grant — see [TRADEMARK.md](TRADEMARK.md). Forks must rebrand unless given written permission; referring to your fork as "based on FONY" is fine.
- See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community guidelines.

---

© 2026 Block Ark Studios
