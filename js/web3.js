import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";
import { contractConfigs } from "./web3/contracts.js";

const TRACKS_MODE = "all";

export async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not installed");
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
      const response = await fetch(tokenURI);
      if (!response.ok) continue;
      const metadata = await response.json();
      let trackUrl = metadata.animation_url;
      if (trackUrl) trackUrl = config.extraProcessing(trackUrl);
      let cover = metadata.image;
      if (cover) cover = config.extraProcessing(cover);
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
      <span id="walletAddress">${shortAddr}</span>
      <img src="/img/wallet.svg" alt="Wallet" id="walletIcon" style="cursor: pointer; width: 28px; height: 28px;">
      <img src="/img/radio.svg" alt="Radio" id="radioModeBtn" style="cursor: pointer; width: 28px; height: 28px;">
    `;
  }
  const r = document.getElementById("radioModeBtn");
  if (r) {
    r.style.display = "inline-block";
    r.addEventListener("click", () => { if (typeof switchToRadio === "function") switchToRadio(); });
  }
}
