import { ic } from "./icons.js"
import { makeDemo } from "./demo.js"
import { buildPlayerHtml } from "./player.js"

const questions = [
  ["What do I need to publish?", "Connect a Tezos wallet, add your Pinata storage key and choose or create an objkt collection. Keep some tez in your wallet for network fees."],
  ["Where are the files stored?", "The audio, artwork and player are uploaded to IPFS through your Pinata account. Keep them pinned so listeners can access the release."],
  ["Can I finish a draft later?", "The factory keeps your draft in this browser for up to seven days. Open it on the same device and browser to pick up where you left off."]
]

export function drawAbout(pane, { go }) {
  pane.innerHTML = `
    <article class="ab">
      <header class="ab-hero">
        <div class="ab-intro">
          <h2>Playable releases</h2>
          <p class="ab-lead">Listen to independent releases, or publish your own. Each release pairs the original artwork with a tracklist in a player collectors can own on Tezos.</p>
          <div class="ab-actions">
            <button type="button" class="nft-btn" data-go="gallery">Explore releases ${ic("right")}</button>
            <button type="button" class="nft-btn ghost" data-go="factory">Create a release</button>
          </div>
        </div>
        <img class="ab-artist" src="/img/about/dino-band-flat.webp" width="1200" height="600" alt="">
        <figure class="ab-demo">
          <div class="ab-demo-frame" id="abDemo"><span>Loading player&hellip;</span></div>
          <figcaption>${ic("disc")}<div><strong>Sketches</strong><span>Demo EP &middot; 3 tracks</span></div></figcaption>
        </figure>
      </header>
      <section class="ab-section">
        <h3>Release notes</h3>
        <dl class="ab-notes">
          <div><dt>${ic("music")}Artwork &amp; audio</dt><dd>Your cover fills the player. Arrange the tracklist and listen to the preview before publishing.</dd></div>
          <div><dt>${ic("layers")}Editions</dt><dd>Choose the edition size and royalties. Each copy opens the same complete release.</dd></div>
          <div><dt>${ic("upload")}Publication</dt><dd>Sign the mint in your wallet to add the release to your collection. You can then list editions on objkt.</dd></div>
        </dl>
      </section>
      <section class="ab-section">
        <h3>Before you mint</h3>
        <div class="ab-faq">${questions.map(([q, a]) => `
          <details><summary>${q}${ic("plus")}</summary><p>${a}</p></details>`).join("")}</div>
      </section>
    </article>`

  for (const button of pane.querySelectorAll("[data-go]")) {
    button.addEventListener("click", () => go(button.dataset.go))
  }

  // the demo: the real player, fed with a cover and three sketches made right here
  let gone = false
  let demo = null
  const timer = setTimeout(async () => {
    try {
      const d = await makeDemo()
      if (gone) { d.revoke(); return }
      demo = d
      const html = buildPlayerHtml({
        title: "Sketches", artist: "FONY demo", previewCover: d.cover,
        tracks: d.tracks.map(t => ({ title: t.title, artist: "FONY demo", previewAudio: t.url }))
      })
      const frame = document.createElement("iframe")
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin")
      frame.setAttribute("allow", "autoplay")
      frame.title = "Live demo of a FONY player"
      frame.srcdoc = html
      const box = pane.querySelector("#abDemo")
      if (box) { box.innerHTML = ""; box.appendChild(frame) }
    } catch (_) {
      if (gone) return
      const box = pane.querySelector("#abDemo")
      if (box) box.innerHTML = `<span class="ab-demo-load">The demo could not be built in this browser.</span>`
    }
  }, 60)

  return () => {
    gone = true
    clearTimeout(timer)
    if (demo) demo.revoke()
  }
}
