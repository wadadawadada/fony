// Loads the Music Label (the NFT studio) only when its button is pressed. The code and the styles are fetched on the
// first click; until then the other modes of the app carry none of it. When the window is closed the studio lets go of
// its data again (see teardown() in nft-studio.js).

const STYLES = [
  "/css/nft-theme.css?v=2",
  "/css/nft.css?v=4",
  "/css/nft-factory.css?v=24",
  "/css/nft-about.css?v=9",
  "/css/nft-buttons.css?v=7"
]

const btn = document.getElementById("nftBtn")
let studio = null
let loading = null

function loadStyles() {
  return Promise.all(STYLES.map(href => new Promise((resolve) => {
    if (document.querySelector(`link[data-nft][href="${href}"]`)) return resolve()
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.dataset.nft = "1"
    link.onload = link.onerror = () => resolve()
    document.head.appendChild(link)
  })))
}

function ensure() {
  if (studio) return Promise.resolve(studio)
  if (!loading) {
    loading = Promise.all([loadStyles(), import("./nft-studio.js")])
      .then(([, mod]) => (studio = mod))
      .catch((err) => { loading = null; throw err })
  }
  return loading
}

if (btn) {
  btn.addEventListener("click", async () => {
    btn.classList.add("is-loading")
    try {
      const mod = await ensure()
      mod.toggleStudio()
    } catch (err) {
      console.error("Music Label could not be loaded", err)
    } finally {
      btn.classList.remove("is-loading")
    }
  })
}
