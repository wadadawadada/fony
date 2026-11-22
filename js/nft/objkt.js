// Read-only data: the objkt.com public GraphQL API (mainnet) and TzKT (both networks).
// Tokens made by the studio carry the tag FONY_TAG in their metadata, which is how the browser finds them.

import { NETWORKS } from "./wallet.js"

// Every release made in the studio carries this tag and the attribute below. objkt indexes tags and attributes (it does
// not index the mintingTool field), so the gallery can filter on them in the query itself.
export const FONY_TAG = "fony music"
const LEGACY_TAG = "fony label"   // the first releases carry this older tag: still listed, never written again
export const FONY_ATTRIBUTE = { name: "Minted with", value: "FONY" }
const GQL = "https://data.objkt.com/v3/graphql"
// objkt's Minting Factory (mainnet): collections made on objkt.com/create live here, and only the factory
// can mint into them, so the studio talks to the factory instead of to the collection contract.
export const FACTORY = "KT1Aq4wWmVanpQhq4TTfjZXB5AjFpx15iQMM"
// public gateways, the one that serves our Pinata pins first (ipfs.io is moving to a service-worker-only gateway)
export const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.filebase.io/ipfs/", "https://ipfs.io/ipfs/", "https://w3s.link/ipfs/"]

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) throw new Error("objkt answered with " + res.status)
  const json = await res.json()
  if (json.errors && json.errors.length) throw new Error(json.errors[0].message || "objkt query failed")
  return json.data
}

// the same ipfs:// uri through a chosen gateway
export function ipfsVia(gateway, uri) {
  if (!uri) return ""
  if (uri.startsWith("ipfs://")) return gateway + uri.slice(7).replace(/^ipfs[/]/, "")
  return uri
}

// A page (HTML) has to come from a gateway that serves HTML: Pinata's public gateway answers 403 for it.
export function ipfsHtml(uri) {
  return ipfsVia("https://ipfs.filebase.io/ipfs/", uri)
}

export function ipfsUrl(uri) {
  if (!uri) return ""
  if (uri.startsWith("ipfs://")) return GATEWAYS[0] + uri.slice(7).replace(/^ipfs\//, "")
  return uri
}

const TOKEN_FIELDS = `
  pk name description token_id fa_contract mime supply timestamp
  artifact_uri display_uri thumbnail_uri metadata
  fa { name contract }
  creators { creator_address }
  tags { tag { name } }
  lowest_ask
`

// Tokens carrying the FONY tag. owner/creator filters are optional.
export async function browseTokens({ creator = null, search = "", limit = 24, offset = 0 } = {}) {
  // supply 0 = every edition was burned (sent to the burn address): such a release is gone and is not listed
  // the tag AND the "Minted with: FONY" attribute: copying only the tag is not enough to appear in the feed
  const where = { _and: [
    { tags: { tag: { name: { _in: [FONY_TAG, LEGACY_TAG] } } } },
    { attributes: { attribute: { name: { _eq: FONY_ATTRIBUTE.name }, value: { _eq: FONY_ATTRIBUTE.value } } } },
    { supply: { _gt: 0 } }
  ] }
  if (creator) where._and.push({ creators: { creator_address: { _eq: creator } } })
  if (search) where._and.push({ name: { _ilike: "%" + search.replace(/[%_]/g, "") + "%" } })
  const data = await gql(
    `query($where: token_bool_exp!, $limit: Int!, $offset: Int!) {
       token(where: $where, order_by: { timestamp: desc }, limit: $limit, offset: $offset) { ${TOKEN_FIELDS} }
     }`,
    { where, limit, offset }
  )
  return data.token || []
}

// Collections the wallet created (it can mint into the ones it administers).
export async function walletCollections(addr) {
  const data = await gql(
    `query($a: String!) {
       fa(where: { creator_address: { _eq: $a }, type: { _eq: "fa2" } }, order_by: { timestamp: desc }, limit: 100) {
         contract name items logo collection_type ledger_type
       }
     }`,
    { a: addr }
  )
  return data.fa || []
}

// ---- TzKT (works on both networks) ----

async function tzkt(network, path) {
  const base = (NETWORKS[network] || NETWORKS.mainnet).tzkt
  const res = await fetch(base + path)
  if (!res.ok) throw new Error("TzKT answered with " + res.status)
  return res.json()
}

// Collections of an account straight from the chain (needed on Ghostnet, where objkt has no index).
export async function chainCollections(network, addr) {
  const list = await tzkt(network, `/contracts?creator=${addr}&kind=asset&limit=100&sort.desc=firstActivity`)
  return list.map(c => ({ contract: c.address, name: c.alias || null, items: c.tokensCount || 0, ledger_type: "nft_asset" }))
}

export async function contractEntrypoints(network, kt) {
  const list = await tzkt(network, `/contracts/${kt}/entrypoints?json=true`)
  const out = {}
  for (const e of list) out[e.name] = e.jsonParameters
  return out
}

export async function nextTokenId(network, kt) {
  const rows = await tzkt(network, `/tokens?contract=${kt}&sort.desc=tokenId&limit=1&select=tokenId`)
  return rows.length ? Number(rows[0]) + 1 : 0
}

export async function contractAdmin(network, kt) {
  try {
    const st = await tzkt(network, `/contracts/${kt}/storage`)
    return st.administrator || st.admin || st.owner || null
  } catch (_) { return null }
}

export function tokenLink(network, contract, tokenId) {
  return `${(NETWORKS[network] || NETWORKS.mainnet).objkt}/tokens/${contract}/${tokenId}`
}

// Collections of the wallet on the objkt Minting Factory: [{ id, contract, name, logo }]. Mainnet only.
export async function factoryCollections(addr) {
  const rows = await tzkt("mainnet", `/contracts/${FACTORY}/bigmaps/artist_collections/keys?value.creator=${addr}&active=true&limit=200&sort.desc=id`)
  const list = rows.map(r => ({ id: Number(r.key), contract: r.value.contract, name: null, logo: null }))
  if (!list.length) return list
  try {
    const data = await gql(
      `query($c: [String!]) { fa(where: { contract: { _in: $c } }) { contract name logo } }`,
      { c: list.map(l => l.contract) }
    )
    for (const f of data.fa || []) {
      const hit = list.find(l => l.contract === f.contract)
      if (hit) { hit.name = f.name; hit.logo = f.logo }
    }
  } catch (_) {}
  return list
}

// The newest collection the wallet made (to find the contract right after creating one).
export async function newestFactoryCollection(addr) {
  const list = await factoryCollections(addr)
  return list[0] || null
}

// Token id of the newest token of a contract, retried while TzKT indexes the block.
export async function newestTokenId(network, kt, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const rows = await tzkt(network, `/tokens?contract=${kt}&sort.desc=tokenId&limit=1&select=tokenId`)
      if (rows.length) return Number(rows[0])
    } catch (_) {}
    await new Promise(r => setTimeout(r, 3000))
  }
  return null
}

export function collectionLink(network, contract) {
  return `${(NETWORKS[network] || NETWORKS.mainnet).objkt}/collections/${contract}`
}

export function profileLink(network, address) {
  return `${(NETWORKS[network] || NETWORKS.mainnet).objkt}/profile/${address}`
}

// Name and avatar of a wallet on objkt (null when it has no profile there).
export async function holderProfile(addr) {
  try {
    const data = await gql("query($a: String!) { holder(where: { address: { _eq: $a } }, limit: 1) { alias logo } }", { a: addr })
    const h = (data.holder || [])[0]
    return h ? { alias: h.alias || "", logo: h.logo || "" } : null
  } catch (_) { return null }
}
