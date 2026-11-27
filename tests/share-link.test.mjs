import test from "node:test"
import assert from "node:assert/strict"
import { buildStationLink, parseStationHash, packPlaylistSource, unpackPlaylistSource } from "../js/share-link.js"

const CAT = "https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/%2Bmerged%2B/"
const station = { url: "https://stream.example.bg:8000/live.mp3", name: "Radio Bulgaria", genre: "Bulgaria" }

test("catalog playlists become a short token and come back to the same URL", () => {
  const url = CAT + "b/bulgaria.m3u"
  assert.equal(packPlaylistSource(url), "c:b/bulgaria")
  assert.equal(unpackPlaylistSource("c:b/bulgaria"), url)
})

test("catalog names with spaces and symbols survive", () => {
  const url = CAT + "r/rock%20%26%20roll.m3u"
  const token = packPlaylistSource(url)
  assert.equal(unpackPlaylistSource(token), url)
})

test("other playlist URLs are carried as base64url", () => {
  const url = "https://example.com/lists/my_radios.m3u"
  const token = packPlaylistSource(url)
  assert.ok(token.startsWith("u:"))
  assert.equal(unpackPlaylistSource(token), url)
})

test("a full link round-trips", () => {
  const link = buildStationLink({ base: "https://fony.fun/", genre: "my radios", stationHash: "a4eb38", station, playlistFile: CAT + "b/bulgaria.m3u" })
  const parsed = parseStationHash(link.slice(link.indexOf("#")))
  assert.equal(parsed.genre, "my radios")
  assert.equal(parsed.stationHash, "a4eb38")
  assert.deepEqual(parsed.station, station)
  assert.equal(parsed.playlistUrl, CAT + "b/bulgaria.m3u")
})

test("old links without s and p still parse", () => {
  const parsed = parseStationHash("#bulgaria/a4eb38")
  assert.equal(parsed.genre, "bulgaria")
  assert.equal(parsed.station, null)
  assert.equal(parsed.playlistUrl, "")
})

test("Nostr and other hashes are not station links", () => {
  assert.equal(parseStationHash("#nostr/tune?s=abc"), null)
  assert.equal(parseStationHash("#nostr/" + "a".repeat(64)), null)
  assert.equal(parseStationHash("#/nostr/npub1xyz"), null)
  assert.equal(parseStationHash("#"), null)
  assert.equal(parseStationHash(""), null)
})

test("unsafe or broken parts are dropped, not trusted", () => {
  assert.equal(unpackPlaylistSource("c:../secret"), "")
  assert.equal(unpackPlaylistSource("c:a/b/c"), "")
  assert.equal(unpackPlaylistSource("u:" + Buffer.from("javascript:alert(1)").toString("base64url")), "")
  assert.equal(parseStationHash("#g/abc123?s=@@@").station, null)
  const js = Buffer.from(JSON.stringify(["javascript:alert(1)", "x", "y"])).toString("base64url")
  assert.equal(parseStationHash(`#g/abc123?s=${js}`).station, null)
})
