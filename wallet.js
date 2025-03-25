// wallet.js
// Для работы используется ethers.js. В данном примере импортируем его из CDN.
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

// Здесь первым идёт "реальный" (изначальный) контракт Soneium (chainId 0x74c, адрес 0x11b30AfA5d01AC8b0D72C6C405F1Ad67aef9e506, ABI как в старом коде),
// а потом — два фейковых для примера.
// При желании можно токенId, ABI и прочие детали менять.
export const BLOCKARK_CONTRACTS = [
  {
    name: "Block Ark (Soneium Mainnet)",
    chainId: "0x74c",
    address: "0x11b30AfA5d01AC8b0D72C6C405F1Ad67aef9e506",
    abi: [
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
      }
    ]
  },
  {
    name: "Block Ark (TestChain)",
    chainId: "0x74c",
    address: "0x11b30AfA5d01AC8b0D72C6C405F1Ad67aef9e506",
    abi: [
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
      }
    ]
  },
  {
    name: "Block Ark (TestChain)",
    chainId: "0x74c",
    address: "0x11b30AfA5d01AC8b0D72C6C405F1Ad67aef9e506",
    abi: [
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
      }
    ]
  }
];

// Подключение к выбранному контракту, переключение сети, загрузка треков
export async function connectAndLoadWalletNFTs(selectedContract) {
  if (!selectedContract) {
    alert("Contract not selected");
    return [];
  }

  if (!window.ethereum) {
    alert("MetaMask не установлен. Пожалуйста, установите MetaMask.");
    throw new Error("MetaMask not installed");
  }

  // Запрашиваем аккаунты
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const account = accounts[0];
  console.log("Подключен аккаунт:", account);

  // Проверяем, какая сеть выбрана
  const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
  console.log("Текущий chainId:", currentChainId);

  // Если нужно, переключаем сеть
  if (currentChainId.toLowerCase() !== selectedContract.chainId.toLowerCase()) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: selectedContract.chainId }]
      });
      console.log("Переключение на ", selectedContract.chainId, " выполнено успешно.");
    } catch (switchError) {
      alert("Не удалось переключиться на нужную сеть: " + selectedContract.chainId);
      throw switchError;
    }
  }

  // Создаём провайдер и контракт
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const contract = new ethers.Contract(selectedContract.address, selectedContract.abi, provider);

  // Пример: Пусть у нас есть tokenId = 0
  // (Либо в вашем случае список tokenId, если NFT в контракте разные.)
  const tokenId = 0;
  let balance;
  try {
    balance = await contract.balanceOf(account, tokenId);
    console.log("Баланс у пользователя tokenId=0:", balance.toString());
  } catch (error) {
    console.error("Ошибка при вызове balanceOf:", error);
    throw error;
  }

  const numTokens = balance.toNumber();
  if (numTokens === 0) {
    console.log("В кошельке нет NFT треков (tokenId 0) на данном контракте.");
    return [];
  }

  // Получаем URI и грузим метаданные
  let tokenURI = await contract.uri(tokenId);
  if (tokenURI.startsWith("ipfs://")) {
    tokenURI = "https://ipfs.io/ipfs/" + tokenURI.slice(7);
  }
  console.log("Полученный tokenURI:", tokenURI);

  try {
    const response = await fetch(tokenURI);
    if (!response.ok) {
      console.error("Ошибка HTTP при загрузке метаданных:", response.status);
      return [];
    }
    const metadata = await response.json();
    console.log("Метаданные:", metadata);
    
    // Обработка полей: animation_url (трек), image (обложка), name (название)
    let trackUrl = metadata.animation_url;
    if (trackUrl && trackUrl.startsWith("ipfs://")) {
      trackUrl = "https://ipfs.io/ipfs/" + trackUrl.slice(7);
    }
    let cover = metadata.image;
    if (cover && cover.startsWith("ipfs://")) {
      cover = "https://ipfs.io/ipfs/" + cover.slice(7);
    }
    
    if (trackUrl) {
      return [{
        title: metadata.name || "Unknown Track",
        url: trackUrl,
        cover: cover || null,
        balance: numTokens
      }];
    } else {
      console.warn("animation_url не найден в метаданных.");
      return [];
    }
  } catch (error) {
    console.error("Ошибка загрузки или парсинга метаданных:", error);
    return [];
  }
}
