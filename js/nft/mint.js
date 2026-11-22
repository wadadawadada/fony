// The minting pipeline: pin audio + cover, build the HTML player, pin it, write the TZIP-21 metadata,
// pin that, then mint every token from the wallet in batches (one wallet confirmation per batch).

import { pinFile, pinJson, pinHtml } from "./ipfs.js"
import { buildPlayerHtml } from "./player.js"
import { FONY_TAG, FACTORY, contractEntrypoints, nextTokenId, newestTokenId } from "./objkt.js"
import { getContract, getState } from "./wallet.js"


const toHex = (str) => Array.from(new TextEncoder().encode(str), b => b.toString(16).padStart(2, "0")).join("")

// Reads the schema of the collection's "mint" entrypoint and returns a function that builds its arguments.
// Collections made by different tools name the fields differently, so they are matched by meaning.
export function mintAdapter(entrypoints) {
  const params = entrypoints && entrypoints.mint
  if (!params) throw new Error("This contract has no mint entrypoint. Pick a collection you administer.")
  const schema = params["schema:object"]
  if (!schema) throw new Error("This collection's mint entrypoint has a shape the studio does not know yet.")
  const plan = []
  for (const key of Object.keys(schema)) {
    const name = key.split(":")[0]
    if (/^(address|owner|to_?|to_address|recipient)$/i.test(name)) plan.push([name, "owner"])
    else if (/^(metadata|token_info|tokeninfo|token_metadata)$/i.test(name)) plan.push([name, "metadata"])
    else if (/^(token_id|tokenid|id)$/i.test(name)) plan.push([name, "id"])
    else if (/^(amount|editions|qty|quantity|supply)$/i.test(name)) plan.push([name, "amount"])
    else throw new Error(`This collection's mint needs a field "${name}" that the studio cannot fill in.`)
  }
  if (!plan.some(p => p[1] === "owner") || !plan.some(p => p[1] === "metadata")) {
    throw new Error("This collection's mint entrypoint has a shape the studio does not know yet.")
  }
  return (ctx) => {
    const args = {}
    for (const [name, role] of plan) {
      if (role === "owner") args[name] = ctx.owner
      else if (role === "metadata") args[name] = { "": toHex(ctx.metadataUri) }
      else if (role === "id") args[name] = ctx.tokenId
      else if (role === "amount") args[name] = ctx.editions
    }
    return args
  }
}

const audioMime = (file) => file.type || ({ mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", opus: "audio/opus" }[(file.name.split(".").pop() || "").toLowerCase()] || "audio/mpeg")

// One release = ONE token: a single HTML player holding the whole playlist, one cover.
// release: { title, artist, description, editions, cover: File, tracks: [{ audio: File, title, artist }] }
// opts: { collection, royaltiesPct, tags: string[], rights, onStep(label, fraction 0..1) }
export async function mintRelease(release, opts) {
  const { address, network } = getState()
  if (!address) throw new Error("Connect a wallet first")
  if (!opts.collection) throw new Error("Choose a collection")
  if (!release.cover) throw new Error("Add a cover")
  if (!release.tracks.length) throw new Error("Add at least one track")
  const step = opts.onStep || (() => {})
  const n = release.tracks.length
  // progress weights: audio is the heavy part
  const W = { read: 0.04, audio: 0.62, cover: 0.08, player: 0.05, meta: 0.05, wallet: 0.16 }
  let base = 0
  const at = (w, frac, label) => step(label, Math.min(1, base + w * frac))

  // collections made on objkt (collectionId set) are minted through objkt's Minting Factory; any other
  // collection contract is minted into directly, if its mint entrypoint has a shape the studio knows
  const viaFactory = opts.collectionId != null
  if (viaFactory && network !== "mainnet") throw new Error("objkt collections are on Tezos mainnet. Switch the network in the Wallet tab.")
  let build = null
  let tokenId = 0
  if (!viaFactory) {
    at(W.read, 0, "Reading the collection…")
    const entrypoints = await contractEntrypoints(network, opts.collection)
    build = mintAdapter(entrypoints)
    const needsId = Object.keys(entrypoints.mint["schema:object"]).some(k => /^(token_id|tokenid|id)\b/i.test(k.split(":")[0]))
    tokenId = needsId ? await nextTokenId(network, opts.collection) : 0
  }
  base += W.read

  const audioUris = []
  for (let i = 0; i < n; i++) {
    const t = release.tracks[i]
    at(W.audio, i / n, `Uploading track ${i + 1} of ${n}: ${t.title}`)
    audioUris.push(await pinFile(t.audio, t.audio.name, (p) => at(W.audio, (i + p) / n, `Uploading track ${i + 1} of ${n}: ${t.title}`)))
  }
  base += W.audio

  at(W.cover, 0, "Uploading the cover…")
  const coverUri = await pinFile(release.cover, release.cover.name)
  base += W.cover

  at(W.player, 0, "Building the player…")
  const html = buildPlayerHtml({
    title: release.title, artist: release.artist, coverCid: coverUri,
    tracks: release.tracks.map((t, i) => ({ title: t.title, artist: t.artist || release.artist, audioCid: audioUris[i] }))
  })
  const artifactUri = await pinHtml(html, `${release.title}.html`)
  base += W.player

  at(W.meta, 0, "Pinning the metadata…")
  const tags = [...new Set([FONY_TAG, "music", ...(opts.tags || [])])].slice(0, 10)
  const royalties = Math.max(0, Math.min(25, Number(opts.royaltiesPct) || 0))
  const editions = Math.max(1, Number(release.editions) || 1)
  const meta = {
    name: release.title,
    description: release.description || `${release.title}${release.artist ? " by " + release.artist : ""} — ${n} track${n > 1 ? "s" : ""}`,
    decimals: 0,
    symbol: "FONY",
    isBooleanAmount: editions === 1,
    artifactUri,
    displayUri: coverUri,
    thumbnailUri: coverUri,
    formats: [
      { uri: artifactUri, mimeType: "text/html" },
      { uri: coverUri, mimeType: release.cover.type || "image/png" },
      ...release.tracks.map((t, i) => ({ uri: audioUris[i], mimeType: audioMime(t.audio), fileName: t.audio.name }))
    ],
    creators: [address],
    minter: address,
    mintingTool: "FONY",
    date: new Date().toISOString(),
    rights: opts.rights || "© The creator. All rights reserved.",
    tags,
    attributes: [
      ...(release.artist ? [{ name: "Artist", value: release.artist }] : []),
      { name: "Tracks", value: String(n) }
    ],
    royalties: { decimals: 3, shares: { [address]: Math.round(royalties * 10) } }
  }
  const metadataUri = await pinJson(meta, `${release.title}.json`)
  base += W.meta

  at(W.wallet, 0, "Confirm in your wallet…")
  let op
  if (viaFactory) {
    const factory = await getContract(FACTORY)
    op = await factory.methodsObject.mint_artist({ collection_id: opts.collectionId, editions, metadata_cid: toHex(metadataUri), target: address }).send()
  } else {
    const contract = await getContract(opts.collection)
    op = await contract.methodsObject.mint(build({ owner: address, metadataUri, tokenId, editions })).send()
  }
  at(W.wallet, 0.5, "Waiting for the network…")
  await op.confirmation(1)
  if (viaFactory) {
    step("Looking up the new token…", 0.98)
    tokenId = await newestTokenId(network, opts.collection)
  }
  step("Done", 1)
  return { collection: opts.collection, network, tokenId, hash: op.opHash, title: release.title, tracks: n, artifactUri, coverUri, metadataUri }
}
