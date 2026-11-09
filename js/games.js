// Games modal: opens over the player section of the left panel.
// Each game lives in js/games/<id>.js and exports
// { id, title, icon, desc, mount(container) -> { destroy() } }.
import flappy from './games/flappy.js'
import breakout from './games/breakout.js'

const GAMES = [flappy, breakout]

const btn = document.getElementById('gamesBtn')
const modal = document.getElementById('gamesModal')
const closeBtn = document.getElementById('gamesClose')
const menu = document.getElementById('gamesMenu')
const list = document.getElementById('gamesList')
const stage = document.getElementById('gamesStage')
const stageTitle = document.getElementById('gamesStageTitle')
const wrap = document.getElementById('gamesCanvasWrap')
const backBtn = document.getElementById('gamesBack')

if (btn && modal) {
  let current = null
  let consoleWasOpen = false

  const bestOf = (g) => {
    try { return Number(localStorage.getItem('fonyGame:' + g.id + ':best')) || 0 } catch (e) { return 0 }
  }

  function renderList() {
    list.innerHTML = ''
    for (const g of GAMES) {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'cart'
      b.title = g.desc
      const best = bestOf(g)
      b.innerHTML = `<span class="cart-body">
          <span class="cart-grip"></span>
          <span class="cart-label">
            <span class="cart-art">${g.art || g.icon}</span>
            <span class="cart-name">${g.title}</span>
            ${best ? `<span class="cart-best">BEST ${best}</span>` : ''}
          </span>
          <span class="cart-foot"></span>
        </span>
        <span class="cart-desc">${g.desc}</span>`
      b.addEventListener('click', () => start(g))
      li.appendChild(b)
      list.appendChild(li)
    }
    // empty shelf slots for games to come
    for (let i = GAMES.length; i < 3; i++) {
      const li = document.createElement('li')
      li.innerHTML = `<div class="cart cart-empty" aria-hidden="true"><span class="cart-body"><span class="cart-grip"></span><span class="cart-label"><span class="cart-soon">COMING<br>SOON</span></span><span class="cart-foot"></span></span></div>`
      list.appendChild(li)
    }
  }

  function stopGame() {
    if (current) { current.destroy(); current = null }
    wrap.innerHTML = ''
  }

  function start(g) {
    stopGame()
    menu.hidden = true
    stage.hidden = false
    modal.classList.add('is-playing')
    stageTitle.textContent = g.title
    current = g.mount(wrap)
  }

  function showMenu() {
    stopGame()
    stage.hidden = true
    menu.hidden = false
    modal.classList.remove('is-playing')
    renderList()
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation(); e.preventDefault()
      if (!stage.hidden) showMenu(); else close()
      return
    }
    // keep game keys away from the player hotkeys
    if (e.code === 'Space' || e.code === 'KeyV' || (e.code || '').startsWith('Arrow')) e.stopPropagation()
  }

  function open() {
    const chat = document.getElementById('chat')
    consoleWasOpen = !!chat && getComputedStyle(chat).display !== 'none'
    if (consoleWasOpen) document.getElementById('chatUsernameContainer')?.click() // collapse the console
    // cover everything under the top bar
    const bar = document.querySelector('.left-panel .top-bar')
    const panel = document.querySelector('.left-panel')
    if (bar && panel) {
      const top = bar.getBoundingClientRect().bottom - panel.getBoundingClientRect().top
      modal.style.setProperty('--games-top', Math.round(top + 6) + 'px')
    }
    showMenu()
    modal.hidden = false
    document.addEventListener('keydown', onKey, true)
  }

  function close() {
    stopGame()
    modal.classList.remove('is-playing')
    modal.hidden = true
    document.removeEventListener('keydown', onKey, true)
    if (consoleWasOpen) document.getElementById('chatToggleBtn')?.click() // bring the console back
    consoleWasOpen = false
  }

  btn.addEventListener('click', () => (modal.hidden ? open() : close()))
  closeBtn.addEventListener('click', close)
  backBtn.addEventListener('click', showMenu)
  window.addEventListener('resize', () => { if (window.innerWidth <= 768 && !modal.hidden) close() })
}
