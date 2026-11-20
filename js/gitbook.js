const MODAL_ID = 'gitbookModal';
const CONTENT_ID = 'gitbookContent';

async function fetchGitbookJson() {
  try {
    const response = await fetch('../json/gitbook.json');
    if (!response.ok) throw new Error('Failed to fetch gitbook.json');
    return await response.json();
  } catch (error) {
    console.error('Error loading gitbook.json:', error);
    return null;
  }
}

function createModal() {
  if (document.getElementById(MODAL_ID)) return;

  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'manifesto-modal';
  modal.style.cssText = 'display: none; justify-content: center; align-items: center;';

  modal.innerHTML = `
    <div class="manifesto-content gitbook-shell">
      <header class="gitbook-head">
        <span class="gitbook-head-title">FONY <em>Guide</em></span>
        <button class="manifesto-close" id="gitbookCloseBtn" aria-label="Close">&times;</button>
        <div class="gitbook-progress"><span id="gitbookProgress"></span></div>
      </header>
      <div class="gitbook-body">
        <nav class="gitbook-toc" id="gitbookToc"></nav>
        <div class="gitbook-scroll" id="gitbookScroll"><div id="${CONTENT_ID}"></div></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => { modal.style.display = 'none'; };
  document.getElementById('gitbookCloseBtn').addEventListener('click', e => { e.preventDefault(); close(); });
  modal.addEventListener('click', e => { if (e.target === modal) { e.preventDefault(); close(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.style.display !== 'none') close();
  });
}

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bulletHtml(item) {
  const match = item.match(/^([^:]{2,60}):\s(.*)$/s);
  if (match) return `<li><strong>${esc(match[1])}</strong><span>${esc(match[2])}</span></li>`;
  return `<li><span>${esc(item)}</span></li>`;
}

function renderContent(data) {
  const container = document.getElementById(CONTENT_ID);
  const toc = document.getElementById('gitbookToc');
  if (!container || !toc || !data) return;

  const num = i => String(i + 1).padStart(2, '0');

  toc.innerHTML = data.sections.map((sec, i) =>
    `<a href="#${sec.id}" class="gitbook-link" data-id="${sec.id}"><b>${num(i)}</b>${esc(sec.title)}</a>`
  ).join('');

  container.innerHTML = data.sections.map((sec, i) => {
    let html = `<section class="gitbook-section" id="${sec.id}">
      <h2><span class="gitbook-num">${num(i)}</span>${esc(sec.title)}</h2>`;
    if (sec.content) html += `<p>${esc(sec.content)}</p>`;
    if (sec.items) html += `<ul class="gitbook-list">${sec.items.map(bulletHtml).join('')}</ul>`;
    if (sec.commands) {
      html += `<div class="gitbook-cmds">${sec.commands.map(c =>
        `<div class="gitbook-cmd"><code>${esc(c.command)}</code><span>${esc(c.description)}</span></div>`).join('')}</div>`;
    }
    if (sec.tips) html += `<ul class="gitbook-list gitbook-tips">${sec.tips.map(bulletHtml).join('')}</ul>`;
    return html + '</section>';
  }).join('');

  const scroller = document.getElementById('gitbookScroll');
  const progress = document.getElementById('gitbookProgress');
  const links = [...toc.querySelectorAll('.gitbook-link')];
  const sections = [...container.querySelectorAll('.gitbook-section')];

  links.forEach(link => link.addEventListener('click', e => {
    e.preventDefault();
    const target = document.getElementById(link.dataset.id);
    if (target) scroller.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
  }));

  const onScroll = () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    progress.style.width = (max > 0 ? (scroller.scrollTop / max) * 100 : 0) + '%';
    let current = sections[0];
    sections.forEach(sec => { if (sec.offsetTop - 40 <= scroller.scrollTop) current = sec; });
    links.forEach(l => l.classList.toggle('active', l.dataset.id === current.id));
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

async function initGitbook() {
  createModal();

  const data = await fetchGitbookJson();
  if (data) {
    renderContent(data);
  } else {
    const container = document.getElementById(CONTENT_ID);
    if (container) container.textContent = 'Failed to load documentation content.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initGitbook();

  document.body.addEventListener('click', e => {
    const target = e.target.closest('#gitbookIcon');
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'flex';
    }

    if (window.location.hash === '#') {
      history.replaceState(null, null, ' ');
    }
  });
});
