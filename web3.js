import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

const SONEUM_CHAIN_ID = "0x74c";
const SONEUM_MINATO_CHAIN_ID = "0x79a";
const NFT_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "uint256", "name": "id", "type": "uint256" }
    ],
    "name": "balanceOf",
    "outputs": [
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" }
    ],
    "name": "uri",
    "outputs": [
      { "internalType": "string", "name": "", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [
      { "internalType": "string", "name": "", "type": "string" }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const NFT_CONTRACTS = [
  { address: "0x267d030dda42efedda58a0e249063b331bba177d", chainId: SONEUM_MINATO_CHAIN_ID }, // Block Ark Testnet — теперь первый
  { address: "0x11b30AfA5d01AC8b0D72C6C405F1Ad67aef9e506", chainId: SONEUM_CHAIN_ID }        // Block Ark Studios — второй
];

export async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not installed");
    throw new Error("MetaMask not installed");
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return ethers.utils.getAddress(accounts[0]);
}

export async function getNFTContractList() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const contracts = [];
  for (const { address, chainId } of NFT_CONTRACTS) {
    const contract = new ethers.Contract(ethers.utils.getAddress(address), NFT_ABI, provider);
    try {
      let collectionName = await contract.name();
      contracts.push({ address: ethers.utils.getAddress(address), collectionName, chainId });
    } catch (error) {
      // Fallback name for known addresses
      let fallbackName;
      if (address.toLowerCase() === "0x11b30afa5d01ac8b0d72c6c405f1ad67aef9e506") {
        fallbackName = "Block Ark Studios";
      } else if (address.toLowerCase() === "0x267d030dda42efedda58a0e249063b331bba177d") {
        fallbackName = "Block Ark Testnet";
      } else {
        fallbackName = "Unknown Contract";
      }
      contracts.push({ address: ethers.utils.getAddress(address), collectionName: fallbackName, chainId });
    }
  }
  return contracts;
}

export async function loadWalletNFTTracks(account, contractAddress) {
  account = ethers.utils.getAddress(account);
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const contract = new ethers.Contract(ethers.utils.getAddress(contractAddress), NFT_ABI, provider);

  // If contract.name() fails, we want our own fallback
  let contractName;
  try {
    contractName = await contract.name();
  } catch (err) {
    if (contractAddress.toLowerCase() === "0x11b30afa5d01ac8b0d72c6c405f1ad67aef9e506") {
      contractName = "Block Ark Studios";
    } else if (contractAddress.toLowerCase() === "0x267d030dda42efedda58a0e249063b331bba177d") {
      contractName = "Block Ark Testnet";
    } else {
      contractName = "Unknown Contract";
    }
  }

  const MAX_TOKEN_ID = 40; 
  const tracks = [];
  for (let tokenId = 0; tokenId < MAX_TOKEN_ID; tokenId++) {
    let balance;
    try {
      balance = await contract.balanceOf(account, tokenId);
    } catch (error) {
      console.error("balanceOf error for token", tokenId, error);
      continue;
    }
    if (balance.toNumber() > 0) {
      let tokenURI = await contract.uri(tokenId);
      if (tokenURI.startsWith("ipfs://")) {
        tokenURI = "https://ipfs.io/ipfs/" + tokenURI.slice(7);
      }
      try {
        const response = await fetch(tokenURI);
        if (!response.ok) {
          console.error("HTTP error for token", tokenId, response.status);
          continue;
        }
        const metadata = await response.json();
        let trackUrl = metadata.animation_url;
        if (trackUrl && trackUrl.startsWith("ipfs://")) {
          trackUrl = "https://ipfs.io/ipfs/" + trackUrl.slice(7);
        }
        let cover = metadata.image;
        if (cover && cover.startsWith("ipfs://")) {
          cover = "https://ipfs.io/ipfs/" + cover.slice(7);
        }
        let songTitle = metadata.name || "Unknown Track";
        let artist = metadata.artist;
        if (!artist && metadata.attributes && Array.isArray(metadata.attributes)) {
          const artistAttr = metadata.attributes.find(attr => attr.trait_type === "Artist");
          if (artistAttr) artist = artistAttr.value;
        }
        artist = artist || "Unknown Artist";

        // Example: "RootCee - Cold World"
        const playlistTitle = `${artist} - ${songTitle}`;
        tracks.push({
          nft: true,
          tokenId,
          title: contractName,    // => stationLabel
          playlistTitle,         // => displayed in playlist + currentTrack
          artist: artist,
          trackTitle: songTitle,
          url: trackUrl,
          cover: cover || null,
          balance: balance.toNumber()
        });
      } catch (error) {
        console.error("Metadata fetch error for token", tokenId, error);
      }
    }
  }
  return tracks;
}

export async function connectAndLoadWalletNFTs(selectedContractAddress) {
  const account = await connectWallet();
  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  const contractInfo = NFT_CONTRACTS.find(
    c => c.address.toLowerCase() === selectedContractAddress.toLowerCase()
  );
  if (contractInfo && currentChainId !== contractInfo.chainId) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: contractInfo.chainId }]
      });
    } catch (e) {}
  }
  const tracks = await loadWalletNFTTracks(account, selectedContractAddress);
  return { account, tracks };
}

