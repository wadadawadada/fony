// Tezos wallet (Beacon) through Taquito. Loaded lazily, only when the NFT studio is opened.
// FONY never sees a private key: the wallet app signs every transaction itself.

const TAQUITO = "https://esm.sh/@taquito/taquito@21.0.0?bundle"
const BEACON = "https://esm.sh/@taquito/beacon-wallet@21.0.0?bundle"
const NET_KEY = "fonyNftNetwork"

export const NETWORKS = {
  mainnet: {
    label: "Tezos mainnet",
    // several public nodes: the first one that answers (with CORS) is used
    rpcs: ["https://rpc.tzbeta.net", "https://mainnet.smartpy.io", "https://rpc.tzkt.io/mainnet", "https://mainnet.ecadinfra.com"],
    tzkt: "https://api.tzkt.io/v1",
    objkt: "https://objkt.com"
  }
}

let libs = null
let wallet = null
let toolkit = null
let address = null
let network = "mainnet"
const listeners = new Set()

try { localStorage.removeItem(NET_KEY) } catch (_) {}   // an old choice of a test network is forgotten: the studio is mainnet only

function loadLibs() {
  if (!libs) libs = Promise.all([import(TAQUITO), import(BEACON)]).catch(err => { libs = null; throw err })
  return libs
}

function emit() {
  for (const fn of listeners) { try { fn(getState()) } catch (_) {} }
}

export function onWalletChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getState() {
  return { address, network, net: NETWORKS[network] }
}

export function getNetwork() { return network }

export async function setNetwork(name) {
  if (!NETWORKS[name] || name === network) return
  network = name
  try { localStorage.setItem(NET_KEY, name) } catch (_) {}
  // a session belongs to one network: the wallet has to be connected again
  if (address) await disconnect()
  else emit()
}

// The first public node that answers a head request in time. Nodes come and go, so none is hard-wired.
async function pickRpc(list) {
  const probe = async (url) => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 4000)
    try {
      const res = await fetch(url + "/chains/main/blocks/head/header", { signal: ctl.signal })
      if (!res.ok) throw new Error("bad status")
      return url
    } finally { clearTimeout(timer) }
  }
  try { return await Promise.any(list.map(probe)) } catch (_) { return list[0] }
}

async function build() {
  const [{ TezosToolkit }, { BeaconWallet }] = await loadLibs()
  const net = NETWORKS[network]
  toolkit = new TezosToolkit(await pickRpc(net.rpcs))
  wallet = new BeaconWallet({ name: "FONY Music Label", network: { type: network }, preferredNetwork: network })
  toolkit.setWalletProvider(wallet)
}

export async function connect() {
  if (!wallet) await build()
  await wallet.requestPermissions()
  address = await wallet.getPKH()
  try { localStorage.setItem("fonyNftHadWallet", "1") } catch (_) {}
  emit()
  return address
}

// Picks up an earlier wallet session without opening anything.
export async function restore() {
  if (address) return address
  // the (large) wallet libraries are only fetched for someone who has connected a wallet before
  let had = false
  try { had = localStorage.getItem("fonyNftHadWallet") === "1" || !!localStorage.getItem("beacon:active-account") } catch (_) {}
  if (!had) return null
  try {
    await build()
    const acc = await wallet.client.getActiveAccount()
    if (acc && acc.address) {
      address = acc.address
      emit()
      return address
    }
  } catch (_) {}
  return null
}

export async function disconnect() {
  try { localStorage.removeItem("fonyNftHadWallet") } catch (_) {}
  try { if (wallet) await wallet.clearActiveAccount() } catch (_) {}
  wallet = null
  toolkit = null
  address = null
  emit()
}

// Lets go of the live wallet connection and the toolkit when the studio is closed. The saved session stays, so the
// next time the studio opens the wallet is picked up again.
export async function release() {
  const w = wallet
  wallet = null
  toolkit = null
  address = null
  // Beacon's destroy() also erases its saved session ("beacon:*" keys), which logged the wallet out on every close:
  // the keys are put back after it has stopped the connection.
  const saved = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith("beacon:")) saved.push([k, localStorage.getItem(k)])
    }
  } catch (_) {}
  try { if (w && w.client && typeof w.client.destroy === "function") await w.client.destroy() } catch (_) {}
  try { for (const [k, v] of saved) localStorage.setItem(k, v) } catch (_) {}
}

export async function getContract(kt) {
  if (!address) throw new Error("Connect a wallet first")
  return toolkit.wallet.at(kt)
}

export function getToolkit() { return toolkit }

export const short = (a) => (a ? a.slice(0, 5) + "…" + a.slice(-4) : "")
