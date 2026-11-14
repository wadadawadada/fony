// The Backup / Restore buttons for the Nostr backup, shared by Settings → Data and Nostr → Profile.
// The button itself shows what is going on: its caption changes (Encrypting…, Approve…, Sending 1/3…,
// Done / Failed), so no separate status text is needed.

import { confirmDialog } from "../local-mode.js"

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 2) return "just now"
  if (m < 120) return m + " min ago"
  if (m < 2880) return Math.round(m / 60) + " h ago"
  return new Date(ts).toLocaleDateString()
}

function caption(btn) {
  return btn.querySelector("span")
}

function label(btn, text, state) {
  const span = caption(btn)
  if (!span) return
  if (!btn.dataset.idle) btn.dataset.idle = span.textContent
  span.textContent = text
  btn.classList.toggle("is-busy", state === "busy")
  btn.classList.toggle("is-ok", state === "ok")
  btn.classList.toggle("is-err", state === "err")
}

function settle(btn, text, state) {
  label(btn, text, state)
  setTimeout(() => label(btn, btn.dataset.idle, ""), 3200)
}

// say(text): errors and notes that do not fit on a button.
// onNeedLogin(): called (after a short pause) when the user is not signed in to Nostr.
export function bindBackup({ backupBtn, restoreBtn, say = () => {}, onNeedLogin = () => {} }) {
  async function ready(btn) {
    const auth = await import("./auth.js")
    await auth.restoreSession()
    if (!auth.isLoggedIn()) {
      settle(btn, "Log in to Nostr", "busy")
      setTimeout(onNeedLogin, 900)
      return null
    }
    return await import("./backup.js")
  }

  backupBtn.addEventListener("click", async () => {
    backupBtn.disabled = restoreBtn.disabled = true
    say("")
    try {
      label(backupBtn, "Checking…", "busy")
      const bk = await ready(backupBtn)
      if (!bk) return
      const r = await bk.backupToNostr((step, i, n) => {
        const part = n > 1 ? ` ${i}/${n}` : ""
        if (step === "encrypt") label(backupBtn, "Encrypting…", "busy")
        else if (step === "sign") label(backupBtn, `Approve${part}…`, "busy")
        else label(backupBtn, `Sending${part}…`, "busy")
      })
      settle(backupBtn, "Done", "ok")
      if (r.skipped.length) say("Left out (too large, use the file backup): " + r.skipped.join(", "))
    } catch (e) {
      settle(backupBtn, "Failed", "err")
      say(String((e && e.message) || e))
    } finally {
      backupBtn.disabled = restoreBtn.disabled = false
    }
  })

  restoreBtn.addEventListener("click", async () => {
    backupBtn.disabled = restoreBtn.disabled = true
    say("")
    try {
      label(restoreBtn, "Checking…", "busy")
      const bk = await ready(restoreBtn)
      if (!bk) return
      label(restoreBtn, "Searching…", "busy")
      const found = await bk.findNostrBackup()
      if (!found) { settle(restoreBtn, "No backup", "err"); return }
      label(restoreBtn, "Approve…", "busy")
      const opened = await bk.openNostrBackup(found)
      label(restoreBtn, "Confirm…", "busy")
      const sure = await confirmDialog({
        title: "Restore this backup?",
        text: `Backup from ${ago(opened.at)} (${Object.keys(opened.entries).length} items). It replaces the data on this device.`,
        okLabel: "Restore",
        danger: false
      })
      if (!sure) { label(restoreBtn, restoreBtn.dataset.idle || "Restore", ""); return }
      label(restoreBtn, "Restoring…", "busy")
      bk.applyBackup(opened.entries)
      location.reload()
    } catch (e) {
      settle(restoreBtn, "Failed", "err")
      say(String((e && e.message) || e))
    } finally {
      backupBtn.disabled = restoreBtn.disabled = false
    }
  })
}
