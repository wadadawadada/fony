// Creating a collection on objkt: the same call objkt.com/create makes, on objkt's Minting Factory.
// The factory originates the FA2 contract for the wallet; the collection metadata is a small JSON on IPFS.

import { pinFile, pinJson } from "./ipfs.js"
import { FACTORY, newestFactoryCollection } from "./objkt.js"
import { getContract, getState } from "./wallet.js"

const toHex = (str) => Array.from(new TextEncoder().encode(str), b => b.toString(16).padStart(2, "0")).join("")

// { name, description, image: File } -> { id, contract }
export async function createCollection({ name, description, image }, onStep = () => {}) {
  const { address, network } = getState()
  if (!address) throw new Error("Connect a wallet first")
  if (network !== "mainnet") throw new Error("objkt collections are created on Tezos mainnet. Switch the network in the Wallet tab.")
  if (!String(name || "").trim()) throw new Error("Give the collection a name")
  if (!image) throw new Error("Add an image for the collection")

  onStep("Uploading the collection image…")
  const imageUri = await pinFile(image, image.name)
  onStep("Pinning the collection metadata…")
  const metaUri = await pinJson({
    authors: [address],
    banner: imageUri,
    description: String(description || "").trim(),
    homepage: "https://objkt.com/collections",
    imageUri,
    interfaces: ["TZIP-12"],
    name: String(name).trim(),
    type: "art"
  }, "collection.json")

  onStep("Confirm in your wallet…")
  const before = await newestFactoryCollection(address)
  const factory = await getContract(FACTORY)
  const op = await factory.methodsObject.create_artist_collection(toHex(metaUri)).send()
  onStep("Waiting for the network…")
  await op.confirmation(1)

  // the factory originated the contract: find it among the wallet's collections
  onStep("Looking up the new collection…")
  for (let i = 0; i < 8; i++) {
    const now = await newestFactoryCollection(address)
    if (now && (!before || now.id !== before.id)) return { id: now.id, contract: now.contract, name: String(name).trim() }
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error("The collection was created but is not indexed yet. Reload the studio in a minute and it will appear.")
}
