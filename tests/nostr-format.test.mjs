import test from "node:test"
import assert from "node:assert/strict"
import * as F from "../js/nostr/format.js"

const PK = "a".repeat(64)

test("validateStreamUrl accepts public http(s) and rejects the rest", () => {
  assert.equal(F.validateStreamUrl("https://stream.example.com/live#x"), "https://stream.example.com/live")
  assert.ok(F.validateStreamUrl("http://radio.example.org:8000/stream"))
  for (const bad of ["javascript:alert(1)", "data:audio/mp3;base64,AAAA", "ftp://x.com/a", "file:///etc/passwd",
    "http://localhost/a", "http://127.0.0.1/a", "http://192.168.1.5/a", "http://10.0.0.1/a", "http://169.254.169.254/",
    "http://[::1]/a", "https://user:pw@example.com/a", "http://intranet/a", "http://2130706433/", "", null, 5]) {
    assert.equal(F.validateStreamUrl(bad), null, String(bad))
  }
})

test("cleanText strips control and bidi characters", () => {
  assert.equal(F.cleanText("a\u202eb\u0000c\n d"), "a b c d")
  assert.equal(F.cleanText("x".repeat(500), 10).length, 10)
  assert.equal(F.cleanText(42), "")
})

test("stationKey treats scheme, www, slash and proxy wrapping as the same station", () => {
  const k = F.stationKey("https://www.Example.com/live/")
  assert.equal(F.stationKey("http://example.com/live"), k)
  assert.equal(F.stationKey("https://fonyserver.up.railway.app/stream?url=" + encodeURIComponent("http://example.com/live")), k)
  assert.notEqual(F.stationKey("http://example.com/other"), k)
  assert.notEqual(F.stationKey("http://example.com:8000/live"), k)
})

test("list event round-trips and de-duplicates", () => {
  const { event, stations } = F.buildListEvent({
    id: "My List!", title: "  Night\u0000 radio ", description: "chill",
    stations: [
      { url: "https://a.example.com/s", name: "A", genre: "Jazz" },
      { url: "http://a.example.com/s/", name: "A dup" },
      { url: "javascript:alert(1)", name: "evil" },
      { url: "https://b.example.com/s", name: "B<script>", homepage: "http://insecure.example.com" }
    ]
  })
  assert.equal(stations.length, 2)
  assert.deepEqual(F.firstTag(event.tags, "d"), ["d", "my-list"])
  assert.equal(event.kind, 30001)
  const parsed = F.parseListEvent({ ...event, pubkey: PK, id: "e".repeat(64) })
  assert.equal(parsed.title, "Night radio")
  assert.equal(parsed.stations.length, 2)
  assert.equal(parsed.stations[1].homepage, "")
  assert.equal(parsed.ref, `30001:${PK}:my-list`)
})

test("parseListEvent ignores foreign lists and hostile tags", () => {
  assert.equal(F.parseListEvent({ kind: 30001, pubkey: PK, tags: [["d", "x"]], content: "" }), null)
  const l = F.parseListEvent({
    kind: 30001, pubkey: PK, id: "1".repeat(64), created_at: 5, content: "",
    tags: [["d", "x"], ["t", "fony-radio"], ["station", "data:text/html,hi", "bad"], ["station"], "junk", ["r", "https://ok.example.com/a"]]
  })
  assert.equal(l.stations.length, 1)               // falls back to the plain r link
  assert.equal(l.stations[0].url, "https://ok.example.com/a")
})

test("latestPerList keeps the newest version", () => {
  const mk = (t, id) => ({ ref: "r", createdAt: t, eventId: id })
  assert.equal(F.latestPerList([mk(1, "a"), mk(3, "b"), mk(2, "c")])[0].eventId, "b")
})

test("planImport never duplicates", () => {
  const existing = [{ url: "https://fonyserver.up.railway.app/stream?url=" + encodeURIComponent("http://a.example.com/s"), genre: "Jazz", addedAt: 1 }]
  const incoming = [
    { url: "http://a.example.com/s", name: "A", genre: "Jazz" },
    { url: "https://new.example.com/s", name: "New", genre: "" },
    { url: "https://new.example.com/s/", name: "New again", genre: "" }
  ]
  const plan = F.planImport(existing, incoming, u => u, 100)
  assert.equal(plan.additions.length, 1)
  assert.equal(plan.skipped.length, 1)
  assert.equal(plan.additions[0].fav.genre, "World")
  assert.equal(F.planImport(existing.concat([plan.additions[0].fav]), incoming).additions.length, 0)
})

test("status events", () => {
  const now = 1000
  const ev = F.buildStatusEvent({ station: { url: "https://a.example.com/s", name: "A" }, track: "Artist - Song", link: "https://fony.fun/#nostr/tune?u=x", now })
  assert.equal(ev.kind, 30315)
  assert.equal(ev.content, "Artist - Song — A")
  const parsed = F.parseStatusEvent({ ...ev, pubkey: PK }, now + 10)
  assert.equal(parsed.station.name, "A")
  assert.equal(F.parseStatusEvent({ ...ev, pubkey: PK }, now + 10000), null) // expired
  assert.equal(F.parseStatusEvent({ ...F.buildStatusClear(now), pubkey: PK }, now + 1), null) // cleared
  assert.equal(F.buildStatusEvent({ station: { url: "javascript:1", name: "x" } }), null)
})

test("profiles and contacts", () => {
  const p = F.parseProfile({ kind: 0, pubkey: PK, content: JSON.stringify({ name: "bob", picture: "http://x.com/a.png", about: "hi" }) })
  assert.equal(p.picture, "")
  assert.equal(F.parseProfile({ kind: 0, pubkey: PK, content: "{oops" }), null)
  assert.deepEqual(F.parseContacts({ kind: 3, tags: [["p", PK], ["p", PK], ["p", "zz"], ["e", PK]] }), [PK])
})

test("relay urls", () => {
  assert.equal(F.normalizeRelayUrl("relay.damus.io"), "wss://relay.damus.io")
  assert.equal(F.normalizeRelayUrl("wss://nos.lol/"), "wss://nos.lol")
  assert.equal(F.normalizeRelayUrl("ws://relay.example.com"), null)
  assert.equal(F.normalizeRelayUrl("wss://localhost:7777"), null)
})

test("links", () => {
  const link = F.buildTuneLink("https://fony.fun", { url: "https://a.example.com/s?x=1", name: "A & B" })
  const hash = link.slice("https://fony.fun/".length)
  assert.equal(F.parseTuneHash(hash).name, "A & B")
  assert.ok(!link.includes("example.com"), "the stream URL is not visible in the link")
  assert.equal(F.parseTuneHash(hash).url, "https://a.example.com/s?x=1")
  assert.equal(F.parseTuneHash("#nostr/tune?u=javascript:1"), null)
  assert.equal(F.parseTuneHash("tune?u=https%3A%2F%2Fa.example.com%2Fs&n=x").name, "x")
  assert.equal(F.extractNostrToken("nostr:npub1acdefghjklmnpqrstuvwxyz023456789"), "npub1acdefghjklmnpqrstuvwxyz023456789")
  assert.equal(F.extractNostrToken("https://fony.fun/#nostr/naddr1qqxnzd3cxqmrzv3exgmr2wfeqgs"), "naddr1qqxnzd3cxqmrzv3exgmr2wfeqgs")
  assert.equal(F.extractNostrToken("hello world"), "")
})

test("fingerprint ignores order", () => {
  const a = [{ url: "https://a.example.com/1" }, { url: "https://b.example.com/2" }]
  assert.equal(F.stationsFingerprint(a), F.stationsFingerprint(a.slice().reverse()))
  assert.notEqual(F.stationsFingerprint(a), F.stationsFingerprint(a.slice(0, 1)))
})

test("feed notes", () => {
  const n = F.buildShareNote({ title: "Jazz", count: 3, link: "https://fony.fun/#nostr/naddr1x", naddr: "naddr1x", ref: "30001:" + PK + ":fony-favorites", now: 5 })
  assert.equal(n.kind, 1)
  assert.ok(n.content.includes("nostr:naddr1x") && n.content.includes("3 stations"))
  assert.ok(n.tags.some(t => t[0] === "a"))
  const l = F.buildListeningNote({ station: { url: "https://a.example.com/s", name: "A\u0000" }, track: "Song", link: "https://fony.fun/#x", now: 5 })
  assert.ok(l.content.startsWith("🎧 Listening to A — Song"))
  assert.equal(F.buildListeningNote({ station: { url: "javascript:1", name: "x" } }), null)
  const withArt = F.buildListeningNote({ station: { url: "https://a.example.com/s", name: "A" }, track: "T", image: "https://i.discogs.com/abc.jpg", now: 5 })
  assert.ok(withArt.content.includes("https://i.discogs.com/abc.jpg") && withArt.tags.some(t => t[0] === "imeta"))
  assert.ok(!F.buildListeningNote({ station: { url: "https://a.example.com/s", name: "A" }, image: "javascript:alert(1)" }).content.includes("javascript"))
})
