import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";
import { contractConfigs } from "./web3/contracts.js";

const TRACKS_MODE = "all";

// ipfs.io alone rate-limits (HTTP 429) and then nothing loads. Metadata is
// fetched through the first gateway that answers; the track and cover URLs of
// that token are served from the same gateway.
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://w3s.link/ipfs/",
  "https://dweb.link/ipfs/"
];
const IPFS_URL = /^https:\/\/[^/]+\/ipfs\/(.+)$/;
let preferredGateway = null;

function viaGateway(url, base) {
  const m = base && url ? url.match(IPFS_URL) : null;
  return m ? base + m[1] : url;
}

async function fetchMetadata(url) {
  const m = url.match(IPFS_URL);
  if (!m) {
    const response = await fetch(url);
    return response.ok ? { response, base: null } : { response: null, base: null };
  }
  const order = preferredGateway
    ? [preferredGateway, ...IPFS_GATEWAYS.filter(g => g !== preferredGateway)]
    : IPFS_GATEWAYS;
  for (const base of order) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(base + m[1], { signal: controller.signal });
      if (response.ok) {
        preferredGateway = base;
        return { response, base };
      }
    } catch (_) {
      // try the next gateway
    } finally {
      clearTimeout(timer);
    }
  }
  return { response: null, base: null };
}

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask not installed");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  return ethers.utils.getAddress(accounts[0]);
}

export async function getNFTContractList() {
  const list = [];
  for (const addr in contractConfigs) {
    const config = contractConfigs[addr];
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(ethers.utils.getAddress(addr), config.abi, provider);
      let collectionName = await contract.name();
      list.push({ address: ethers.utils.getAddress(addr), collectionName, chainId: config.chainId });
    } catch (error) {
      let name = config.collectionName || "Unknown Contract";
      list.push({ address: ethers.utils.getAddress(addr), collectionName: name, chainId: config.chainId });
    }
  }
  return list;
}

async function loadNFTTracks(account, contractAddress) {
  const config = contractConfigs[contractAddress.toLowerCase()];
  if (!config) throw new Error("Contract configuration not found");
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const contract = new ethers.Contract(ethers.utils.getAddress(contractAddress), config.abi, provider);
  let contractName;
  try { contractName = await contract.name(); } catch { contractName = config.collectionName || "Unknown Collection"; }
  const MAX_TOKEN_ID = 40;
  const tracks = [];
  for (let tokenId = 0; tokenId < MAX_TOKEN_ID; tokenId++) {
    try {
      if (TRACKS_MODE !== "all" && config.checkBalance) {
        const balance = await contract.balanceOf(account, tokenId);
        if (balance.toNumber() <= 0) continue;
      }
      let tokenURI = await contract[config.metadataMethod](tokenId);
      tokenURI = config.extraProcessing(tokenURI);
      const { response, base } = await fetchMetadata(tokenURI);
      if (!response) continue;
      const metadata = await response.json();
      let trackUrl = metadata.animation_url;
      if (trackUrl) trackUrl = viaGateway(config.extraProcessing(trackUrl), base);
      let cover = metadata.image;
      if (cover) cover = viaGateway(config.extraProcessing(cover), base);
      const songTitle = metadata.name || "Unknown Track";
      let artist = metadata.artist;
      if (!artist && Array.isArray(metadata.attributes)) {
        const artistAttr = metadata.attributes.find(attr => attr.trait_type === "Artist");
        if (artistAttr) artist = artistAttr.value;
      }
      artist = artist || "Unknown Artist";
      tracks.push({
        nft: true,
        tokenId,
        title: contractName,
        playlistTitle: `${artist} - ${songTitle}`,
        artist,
        trackTitle: songTitle,
        url: trackUrl,
        cover: cover || null,
        balance: config.checkBalance ? (await contract.balanceOf(account, tokenId)).toNumber() : null
      });
    } catch (err) {}
  }
  return tracks;
}

export async function connectAndLoadNFTsFromContract(contractAddress) {
  const account = await connectWallet();
  const config = contractConfigs[contractAddress.toLowerCase()];
  if (!config) throw new Error("Contract configuration not found");
  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (currentChainId !== config.chainId) {
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: config.chainId }] });
    } catch (e) {}
  }
  const tracks = await loadNFTTracks(account, contractAddress);
  return { account, tracks };
}

export async function connectAndLoadWalletNFTs(contractAddress) {
  return await connectAndLoadNFTsFromContract(contractAddress);
}

export async function updateWalletUI(account) {
  const contracts = await getNFTContractList();
  contracts.sort((a, b) => a.collectionName.localeCompare(b.collectionName));
  const g = document.querySelector(".genre-box");
  if (g) {
    const ops = contracts.map(x => `<option value="${x.address}">${x.collectionName}</option>`).join("");
    const shortAddr = account.slice(0, 2) + "..." + account.slice(-2);
    g.innerHTML = `
      <span id="walletConnectedLabel">WEB3: </span>
      <select id="contractSelect" class="genre-select">${ops}</select>
      <img src="/img/radio.svg" alt="Radio" id="radioModeBtn" style="cursor: pointer; width: 28px; height: 28px;">
    `;
    const addrEl = document.getElementById('walletAddress');
    if (addrEl) addrEl.textContent = shortAddr;
  }
  const r = document.getElementById("radioModeBtn");
  if (r) {
    r.style.display = "inline-block";
    r.addEventListener("click", () => { if (typeof switchToRadio === "function") switchToRadio(); });
  }
}
