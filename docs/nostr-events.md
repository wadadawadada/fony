# FONY Nostr event formats

FONY uses standard Nostr events and adds a few documented, optional tags. Everything
here is implemented in [`js/nostr/format.js`](../js/nostr/format.js) and covered by
[`tests/nostr-format.test.mjs`](../tests/nostr-format.test.mjs).

| Purpose | Kind | NIP |
| --- | --- | --- |
| Shared station list ("Shared Favorites") | `30001` (parameterized replaceable) | [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) |
| Now listening | `30315` (parameterized replaceable) | [NIP-38](https://github.com/nostr-protocol/nips/blob/master/38.md) |
| Profile / follow list (read only) | `0` / `3` | NIP-01 / NIP-02 |
| Encrypted backup | `30078` (app-specific data) | [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md) |
| Unshare a list | `5` | [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) |

Sign-in: [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md) (extension) and
[NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md) (remote signer).
Shareable references use [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) (`naddr`, `npub`, `nprofile`).

---

## 1. Shared station list — `kind:30001`

A list is identified by `pubkey` + `kind` + the `d` tag. Publishing again with the same
`d` **replaces** the previous version (this is how *Update Shared Favorites* works).
FONY's default list uses `d = "fony-favorites"`; the format allows any other identifier.

```json
{
  "kind": 30001,
  "created_at": 1763100000,
  "content": "",
  "tags": [
    ["d", "fony-favorites"],
    ["title", "My FONY favorites"],
    ["description", "Late-night jazz and ambient"],
    ["t", "fony-radio"],
    ["fony", "1"],
    ["client", "FONY"],

    ["station", "https://listen.011fm.com/stream11", "011FM Jazz Collection", "Jazz", ""],
    ["r", "https://listen.011fm.com/stream11"],

    ["station", "https://ais-sa2.cdnstream1.com/2346_128.mp3", "1 Radio Jazz", "Jazz", "https://example.com"],
    ["r", "https://ais-sa2.cdnstream1.com/2346_128.mp3"]
  ]
}
```

### Tags

| Tag | Required | Meaning |
| --- | --- | --- |
| `["d", <id>]` | yes | Stable list identifier. Lower-case `a-z 0-9 . _ -`, max 64 characters. |
| `["t", "fony-radio"]` | yes | Marks the list as a FONY station list. Used for discovery (`{"kinds":[30001],"#t":["fony-radio"]}`). Lists without it are ignored by FONY. |
| `["title", <text>]` | no | List name, max 80 characters. |
| `["description", <text>]` | no | Max 500 characters. |
| `["fony", <version>]` | no | Format version. Currently `"1"`. |
| `["client", "FONY"]` | no | Informational. |
| `["station", <url>, <name>, <genre>, <homepage>]` | per item | One radio station (see below). |
| `["r", <url>]` | per item | The same stream URL as a plain NIP-51 link so generic clients can show the list. |

### Station item — `["station", url, name, genre, homepage]`

| Position | Field | Rules |
| --- | --- | --- |
| 1 | `url` | Stream URL. `http:` or `https:` only, public host, no `user:pass@`, max 2000 characters. Fragment is dropped. |
| 2 | `name` | Station name, max 120 characters. Defaults to the host name when empty. |
| 3 | `genre` | Free text, max 60 characters. May be empty. |
| 4 | `homepage` | Optional `https:` URL. Empty string when unknown. |

Readers **must** treat every field as untrusted input: FONY validates URLs, strips control and
bidi-override characters, limits lengths, and renders text with `textContent` only.
If a list has no `station` tags, FONY falls back to the plain `r` links (name = host).
Lists are capped at 500 stations.

### Identity and de-duplication

Two URLs are the same station when they have the same host (without `www.`), port (default
ports ignored) and path (trailing slash ignored) and query — the scheme and fragment do not
matter. FONY uses this when publishing (no duplicates in the list) and when importing (no
duplicates in the user's Favorites).

### Links

`naddr1…` encodes `{ kind: 30001, pubkey, identifier: <d>, relays }`. FONY links:

| Link | Opens |
| --- | --- |
| `https://fony.fun/#nostr/<naddr>` | a station list |
| `https://fony.fun/#nostr/<npub \| nprofile>` | a profile and its lists |
| `https://fony.fun/#nostr/tune?s=<base64url JSON [url, name, genre]>` | plays a single station. The stream URL is packed so clients do not take the link for an audio file. Older `?u=<stream>&n=<name>&g=<genre>` links still open. |

### Behaviour

* **Share** is an explicit user action; **Update** is explicit too, or automatic when the user keeps *Auto-update* on (after sign-in and then at most every 3 hours, only if the local Favorites differ and the catalog is fully loaded). `created_at` is always newer than the version being replaced.
* **Unshare** publishes a NIP-09 deletion (`kind:5`, `["a","30001:<pubkey>:<d>"]`, plus `["e",<id>]` for any feed note that announced the list). Relays may keep copies.
* **Follow** is local: FONY remembers `pubkey` + `d` and compares `created_at` with the newest version on the relays.
* Local Favorites are never read or published without the user pressing Share.

---

## 2. Now listening — `kind:30315`

Standard NIP-38 music status (`d = "music"`) with FONY tags. Publishing is **off by default**.

```json
{
  "kind": 30315,
  "created_at": 1763100000,
  "content": "Artist - Track — 1 Radio Jazz",
  "tags": [
    ["d", "music"],
    ["expiration", "1763100300"],
    ["fony-station", "https://ais-sa2.cdnstream1.com/2346_128.mp3", "1 Radio Jazz", "Jazz"],
    ["fony-track", "Artist - Track"],
    ["r", "https://fony.fun/#nostr/tune?s=WyJodHRwczovL2Fpcy1zYTIuY2Ruc3RyZWFtMS5jb20vMjM0Nl8xMjgubXAzIiwiMSBSYWRpbyBKYXp6IiwiSmF6eiJd"]
  ]
}
```

| Tag | Meaning |
| --- | --- |
| `["d","music"]` | NIP-38 status type. |
| `["expiration", <unix>]` | NIP-40. FONY sets it 5 minutes ahead and refreshes while playing, so a status that could not be cleared (closed tab) disappears by itself. |
| `["fony-station", url, name, genre]` | The station, validated like a list item. Clients that only know NIP-38 can ignore it. |
| `["fony-track", <text>]` | Current track title from the stream's metadata, if any. |
| `["r", <link>]` | A FONY tune-in link. |

**Lifecycle.** Published a few seconds after a station starts, again when the station or track changes
(at most once per 15 s), and every 2.5 minutes while playing. When playback is paused or stopped
(for longer than a short grace period, so switching stations does not flicker) FONY publishes an
empty-content status (`content: ""`, short expiration), which NIP-38 defines as clearing it.
Playing local files never publishes anything.

**Reading.** FONY queries `{"kinds":[30315],"authors":[<follows>],"#d":["music"],"since":<now-15min>}`,
ignores expired and empty statuses and keeps the newest per account. Statuses with a valid
`fony-station` tag get a **Tune In** button.

Signers that ask for approval on every event can be set to always allow `kind 30315`.

---

## 3. Encrypted backup — `kind:30078`

A backup is stored as NIP-78 application data. It is split into 1–8 events with `d = "fony-backup"`, `"fony-backup-1"`, …
so a new backup replaces the previous one, and each event carries at most ~60 KB. All parts share one `["bid", <id>]` tag.

```json
// part 0 (d = "fony-backup")
{ "v": 2, "scheme": "nip44", "key": "<AES key, NIP-44 encrypted to the author>", "iv": "<base64>", "n": 3, "part": "<base64 chunk 0>" }
// parts 1…n-1 (d = "fony-backup-<i>")
{ "v": 2, "part": "<base64 chunk i>" }
```

The chunks, concatenated, are the base64 AES-GCM ciphertext of `gzip(JSON)`; the JSON is `{ "v":1, "app":"FONY", "at":<ms>, "data": { <localStorage key>: <string> } }`.
The AES-256-GCM key is random per backup and wrapped by the user's signer (NIP-44; NIP-04 if the extension has no NIP-44),
so only the account owner can read it. Excluded: the Nostr sign-in (`fonyNostrSession`), profile/list caches and any single entry over 400 KB.
`created_at` of part *i* is `now + i`. Restore checks that all parts of the newest `bid` are present. Version 1 backups (one event with `ct`) are still read.
Backups of more than 8 parts (~480 KB) are refused (use the file backup in Settings). An optional daily auto backup uses the same format.

## 4. Sign-in via `nostrconnect://` (NIP-46)

FONY creates a throw-away client key and shows `nostrconnect://<client-pubkey>?relay=…&secret=<random>&name=FONY&url=<origin>&perms=…`
as a QR code / link. The signer replies with a kind `24133` event whose NIP-44 (or NIP-04) payload carries the secret; FONY then
asks the signer for the user's public key and signs with it remotely. The connect secret is not stored.

## 5. Optional feed notes — `kind:1`

Both are opt-in (checkboxes, off by default) and add nothing to the list or status events.

* **Share note**, sent with *Share / Update Favorites*: `📻 I shared my favorite radio stations on FONY: <title> (<n> stations)`, then `nostr:<naddr>` and the FONY link, `#fony #radio`. Tags: `["t","fony"]`, `["t","radio"]`, `["a","30001:<pubkey>:<d>"]`, `["r",<link>]`, `["client","FONY"]`.
* **Listening note**, sent next to the status when the station changes (the album art is looked up first, FONY waits up to 10 s for it): `🎧 Listening to <station> — <track> on FONY`, the album art (when FONY found a cover for the track: an `https` image URL on its own line plus an `imeta` tag; FONY waits up to 10 s for it) and the tune-in link, `#fony #nowplaying`. At most once every 20 minutes and never twice for the same station in a row.

## 6. Events FONY reads, and the follow list

* `kind:0` profile — `display_name`/`name`, `about`, `picture` (only `https:` avatars are used).
* `kind:3` follow list — `p` tags with 64-hex pubkeys. FONY **writes** it only when the user presses *Follow* / *Following* on a profile:
  the new event is built from the account's newest `kind:3` with every existing tag and the `content` kept as they are, plus or minus one
  `["p", <pubkey>]`, with `created_at` newer than the previous one. If the current list cannot be read from the relays, nothing is published.
* Discover also reads, from anyone: the newest FONY lists, `kind:30315` music statuses that carry a `fony-station` tag (what is playing now),
  and `kind:1` notes tagged `["t","fony"]` + `["client","FONY"]` (people recently active in FONY).

## 7. Security notes

* Every event received from a relay is signature-checked (`verifyEvent`) before use; oversized messages (> 300 KB) are dropped.
* Stream URLs from Nostr are validated: `http(s)` only, no credentials, no `localhost`/private/link-local addresses.
* The private key is never requested, read or stored. With NIP-46 only a random per-browser *client* key and the bunker's public key + relays are kept in `localStorage`; the one-time connect secret is not stored. Logging out deletes them.
* Cached lists and follows in `localStorage` are re-validated when read.

## 8. Extending (not implemented)

Planned extensions can reuse the same building blocks: zaps (NIP-57) on lists or stations, station
chat (NIP-28/NIP-29 channels keyed by the stream URL) and listening rooms (`kind:30315` with a
shared `d` + a room event). None of these are part of this version.
