// A small dialog to take files from the folders already added in Local Files mode.
// pickLocal({ want: "audio" | "image" | "both", multiple }) -> Promise<File[]> ([] when cancelled)

import * as Local from "../local-library.js"

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

export function localAvailable() {
  return typeof window.showDirectoryPicker === "function"
}

export function pickLocal({ want = "audio", multiple = true, host = document.body } = {}) {
  return new Promise((resolve) => {
    const picked = new Map()   // key -> { rootId, path }
    let roots = []
    let root = null
    let path = []

    const back = document.createElement("div")
    back.className = "nft-pick-back"
    back.innerHTML = `<div class="nft-pick" role="dialog" aria-modal="true" aria-label="Choose from Local Files">
        <div class="nft-pick-head"><b>Local Files</b><span class="nft-pick-crumbs"></span><button type="button" class="nft-pick-x" aria-label="Close">&times;</button></div>
        <div class="nft-pick-body"></div>
        <div class="nft-pick-foot"><span class="nft-pick-count">Nothing selected</span><button type="button" class="nft-btn nft-pick-ok" disabled>Add</button></div>
      </div>`
    host.appendChild(back)
    const body = back.querySelector(".nft-pick-body")
    const crumbs = back.querySelector(".nft-pick-crumbs")
    const count = back.querySelector(".nft-pick-count")
    const ok = back.querySelector(".nft-pick-ok")

    const done = async (confirm) => {
      document.removeEventListener("keydown", onKey, true)
      back.remove()
      if (!confirm || !picked.size) return resolve([])
      const files = []
      for (const ref of picked.values()) {
        try { files.push(await Local.getFile(ref.rootId, ref.path)) } catch (_) {}
      }
      resolve(files)
    }
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false) } }
    document.addEventListener("keydown", onKey, true)
    back.addEventListener("click", (e) => { if (e.target === back) done(false) })
    back.querySelector(".nft-pick-x").addEventListener("click", () => done(false))
    ok.addEventListener("click", () => done(true))

    function refreshCount() {
      count.textContent = picked.size ? `${picked.size} selected` : "Nothing selected"
      ok.disabled = !picked.size
    }

    function drawCrumbs() {
      crumbs.innerHTML = ""
      if (!root) return
      const parts = [{ label: root.name, to: [] }, ...path.map((p, i) => ({ label: p, to: path.slice(0, i + 1) }))]
      parts.forEach((part, i) => {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = part.label
        b.addEventListener("click", () => openDir(part.to))
        crumbs.append(b)
        if (i < parts.length - 1) crumbs.append(" / ")
      })
    }

    async function drawRoots() {
      root = null
      path = []
      drawCrumbs()
      roots = await Local.listRoots()
      body.innerHTML = ""
      if (!roots.length) {
        body.innerHTML = `<p class="nft-pick-empty">No folders yet. Open Local Files mode and add a music folder first.</p>`
        return
      }
      for (const r of roots) {
        const b = document.createElement("button")
        b.type = "button"
        b.className = "nft-pick-row dir"
        b.textContent = r.name
        b.addEventListener("click", async () => {
          if (!(await Local.hasAccess(r)) && !(await Local.requestAccess(r))) {
            body.insertAdjacentHTML("afterbegin", `<p class="nft-pick-empty">No access to that folder.</p>`)
            return
          }
          root = r
          openDir([])
        })
        body.append(b)
      }
    }

    async function openDir(p) {
      path = p
      drawCrumbs()
      body.innerHTML = `<p class="nft-pick-empty">Reading…</p>`
      let entries
      try { entries = await Local.listDir(root, path) } catch (_) { body.innerHTML = `<p class="nft-pick-empty">Could not read this folder.</p>`; return }
      body.innerHTML = ""
      const addRow = (cls, label, onclick) => {
        const b = document.createElement(onclick ? "button" : "label")
        if (onclick) b.type = "button"
        b.className = "nft-pick-row " + cls
        b.innerHTML = label
        if (onclick) b.addEventListener("click", onclick)
        body.append(b)
        return b
      }
      if (path.length || roots.length > 1) addRow("dir", "&larr; Back", () => (path.length ? openDir(path.slice(0, -1)) : drawRoots()))
      for (const d of entries.dirs) addRow("dir", "📁 " + esc(d), () => openDir([...path, d]))
      const addFiles = (list, kind) => {
        for (const f of list) {
          const full = [...path, f]
          const key = root.id + "/" + full.join("/")
          const row = addRow("file", `<input type="${multiple ? "checkbox" : "radio"}" name="nftpick"><span>${kind === "audio" ? "♪" : "▣"} ${esc(f)}</span>`)
          const input = row.querySelector("input")
          input.checked = picked.has(key)
          input.addEventListener("change", () => {
            if (!multiple) picked.clear()
            if (input.checked) picked.set(key, { rootId: root.id, path: full })
            else picked.delete(key)
            refreshCount()
          })
        }
      }
      if (want !== "image") addFiles(entries.files, "audio")
      if (want !== "audio") addFiles(entries.images, "image")
      if (!entries.dirs.length && !(want !== "image" && entries.files.length) && !(want !== "audio" && entries.images.length)) {
        body.insertAdjacentHTML("beforeend", `<p class="nft-pick-empty">Nothing suitable in this folder.</p>`)
      }
    }

    drawRoots().catch(() => { body.innerHTML = `<p class="nft-pick-empty">Local Files is not available in this browser.</p>` })
    refreshCount()
  })
}
