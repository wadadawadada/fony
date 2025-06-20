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
  modal.style.cssText = `
    display: none;
    justify-content: center;
    align-items: center;
  `;

  modal.innerHTML = `
    <div class="manifesto-content" style="max-height: 80vh; overflow-y: auto; position: relative; background-color: #171C2B; color: #ddd; font-family: monospace, monospace; padding: 1rem; white-space: pre-wrap;">
      <button class="manifesto-close" id="gitbookCloseBtn" style="position: sticky; top: 0; right: 0; float: right; font-size: 28px; color: #00F2B8; background: none; border: none; cursor: pointer; z-index: 10;">&times;</button>
      <div id="${CONTENT_ID}"></div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('gitbookCloseBtn').addEventListener('click', e => {
    e.preventDefault();
    modal.style.display = 'none';
  });

  modal.addEventListener('click', e => {
    if (e.target === modal) {
      e.preventDefault();
      modal.style.display = 'none';
    }
  });
}

function asciiTitle(text) {
  const line = '═'.repeat(text.length + 4);
  return `╔${line}╗
║  ${text}  ║
╚${line}╝`;
}

function asciiSeparator() {
  return '─'.repeat(50);
}

function renderContent(data) {
  const container = document.getElementById(CONTENT_ID);
  if (!container || !data) return;

  container.innerHTML = '';

  container.innerHTML += asciiTitle('TABLE OF CONTENTS') + '\n\n';

  data.sections.forEach(section => {
    container.innerHTML += `→ [${section.title}](#${section.id})\n`;
  });

  container.innerHTML += '\n' + asciiSeparator() + '\n\n';

  data.sections.forEach(section => {
    container.innerHTML += `<a id="${section.id}"></a>`;
    container.innerHTML += asciiTitle(section.title.toUpperCase()) + '\n\n';

    if (section.content) {
      container.innerHTML += section.content + '\n\n';
    }

    if (section.items) {
      section.items.forEach(item => {
        container.innerHTML += `→ ${item}\n`;
      });
      container.innerHTML += '\n';
    }

    if (section.commands) {
      container.innerHTML += asciiSeparator() + '\n';
      container.innerHTML += 'CHAT COMMANDS\n\n';
      section.commands.forEach(cmd => {
        container.innerHTML += `${cmd.command}: ${cmd.description}\n`;
      });
      container.innerHTML += '\n';
    }

    if (section.tips) {
      container.innerHTML += asciiSeparator() + '\n';
      container.innerHTML += 'USAGE TIPS\n\n';
      section.tips.forEach(tip => {
        container.innerHTML += `→ ${tip}\n`;
      });
      container.innerHTML += '\n';
    }
  });

  convertMarkdownLinks(container);
}

function convertMarkdownLinks(container) {
  container.innerHTML = container.innerHTML.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (match, text, id) => {
    return `<a href="#${id}" class="gitbook-link">${text}</a>`;
  });

  const links = container.querySelectorAll('.gitbook-link');
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
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
