export const SONEUM_CHAIN_ID = "0x74c";
export const SONEUM_MINATO_CHAIN_ID = "0x79a";
export const ETH_CHAIN_ID = "0x1";

export const NFT_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "uint256", "name": "id", "type": "uint256" }
    ],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "uri",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
];

export const NEW_NFT_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [{ "name": "", "type": "string" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{ "name": "tokenId", "type": "uint256" }],
    "name": "tokenURI",
    "outputs": [{ "name": "", "type": "string" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

export const contractConfigs = {
  "0x11b30afa5d01ac8b0d72c6c405f1ad67aef9e506": {
    chainId: SONEUM_CHAIN_ID,
    abi: NFT_ABI,
    metadataMethod: "uri",
    checkBalance: true,
    extraProcessing: (url) =>
      url.startsWith("ipfs://") ? "https://ipfs.io/ipfs/" + url.slice(7) : url,
    collectionName: "Block Ark Studio"
  },
  "0x70be4e3761188d0a8c525e54bb81c4ea97712de4": {
    chainId: ETH_CHAIN_ID,
    abi: NEW_NFT_ABI,
    metadataMethod: "tokenURI",
    checkBalance: false,
    extraProcessing: (url) => {
      if (url.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + url.slice(7);
      if (url.startsWith("ar://")) return "https://arweave.net/" + url.slice(5);
      return url;
    },
    collectionName: "Moonshot"
  },
  "0xcbc67ea382f8a006d46eeeb7255876beb7d7f14d": {
    chainId: ETH_CHAIN_ID,
    abi: NEW_NFT_ABI,
    metadataMethod: "tokenURI",
    checkBalance: false,
    extraProcessing: (url) => {
      if (url.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + url.slice(7);
      if (url.startsWith("ar://")) return "https://arweave.net/" + url.slice(5);
      return url;
    },
    collectionName: "Dreamloops V1"
  }
};
