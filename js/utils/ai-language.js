// The language the AI answers in (Settings → Interface → AI language). Kept in localStorage under "aiLanguage";
// "auto" (the default) means: answer in the language the person writes in, English when in doubt.

export const AI_LANGUAGES = [
  ["auto", "Auto (match my message)"],
  ["English", "English"],
  ["Russian", "Русский"],
  ["Ukrainian", "Українська"],
  ["Spanish", "Español"],
  ["Portuguese", "Português"],
  ["French", "Français"],
  ["German", "Deutsch"],
  ["Italian", "Italiano"],
  ["Dutch", "Nederlands"],
  ["Polish", "Polski"],
  ["Czech", "Čeština"],
  ["Turkish", "Türkçe"],
  ["Arabic", "العربية"],
  ["Hebrew", "עברית"],
  ["Hindi", "हिन्दी"],
  ["Indonesian", "Bahasa Indonesia"],
  ["Chinese (Simplified)", "中文"],
  ["Japanese", "日本語"],
  ["Korean", "한국어"]
]

export function getAiLanguage() {
  try {
    const v = localStorage.getItem("aiLanguage")
    return AI_LANGUAGES.some(([id]) => id === v) ? v : "auto"
  } catch (_) {
    return "auto"
  }
}

export function setAiLanguage(id) {
  try { localStorage.setItem("aiLanguage", id) } catch (_) {}
}

// A sentence to append to a system prompt. Names of artists, tracks, albums and stations are never translated,
// and fixed line formats ("artist | title | year | why") keep their shape: only the free text changes language.
export function languageInstruction() {
  const lang = getAiLanguage()
  if (lang === "auto") return "Answer in the language the user writes in (English if unclear)."
  return `Write every answer in ${lang}, whatever language the user writes in or the instructions are in. ` +
    "Write like an educated native speaker: natural, idiomatic phrasing and rhythm, never a word-for-word translation from English. " +
    "Keep artist names, track titles, album titles, station names, genre tags and any fixed labels or line formats exactly as required; only the free text is in that language."
}

// Adds the instruction to the first system message of a chat-completion request.
export function withLanguage(messages) {
  const note = languageInstruction()
  const out = messages.map(m => ({ ...m }))
  const sys = out.find(m => m.role === "system")
  if (sys) sys.content = `${sys.content}\n\n${note}`
  else out.unshift({ role: "system", content: note })
  return out
}
