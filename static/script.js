(function () {
  'use strict';

  // --- Helpers ---
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  // Small CSS animation helper: adds a class and removes it after animationend
  function animateOnce(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const handler = () => {
      el.classList.remove(cls);
      el.removeEventListener('animationend', handler);
    };
    el.addEventListener('animationend', handler);
  }

  // --- Elements ---
  const loader = qs('#loader');
  const startBtn = qs('#startBtn');
  const app = qs('#app');
  const homeView = qs('#homeView');
  const browserView = qs('#browserView');
  const panicView = qs('#panicView');
  const typewriterEl = qs('#typewriter');
  const cursorEl = qs('.cursor');
  const mainSearchInput = qs('#mainSearchInput');
  const mainSearchBtn = qs('#mainSearchBtn');
  const gamesGrid = qs('.games-grid');
  const gameCards = qsa('.game-card');
  const backBtn = qs('#backBtn');
  const refreshBtn = qs('#refreshBtn');
  const fullscreenBtn = qs('#fullscreenBtn');
  const browserFrame = qs('#browserFrame');
  const iframeLoader = qs('#iframeLoader');
  const blockedMsg = qs('#blockedMsg');
  const currentUrlText = qs('#currentUrlText');
  const themeCheckbox = qs('#checkbox');

  let lastOpenedUrl = null;
  let iframeLoadTimeout = null;

  // --- Typewriter / Hero ---
  const phrases = [
    'Unblocked Games & Browser',
    'Spiele frei, surfe anonym',
    'Sofort starten — Viel Spaß!'
  ];
  let typeIndex = 0;
  let charIndex = 0;
  let typingForward = true;
  let typeDelay = 40;

  function startTypewriter() {
    if (!typewriterEl || !cursorEl) return;
    (function tick() {
      const current = phrases[typeIndex];
      if (typingForward) {
        charIndex++;
        typewriterEl.textContent = current.slice(0, charIndex);
        if (charIndex >= current.length) {
          typingForward = false;
          setTimeout(tick, 1000);
          return;
        }
      } else {
        charIndex--;
        typewriterEl.textContent = current.slice(0, charIndex);
        if (charIndex === 0) {
          typingForward = true;
          typeIndex = (typeIndex + 1) % phrases.length;
          setTimeout(tick, 300);
          return;
        }
      }
      setTimeout(tick, typeDelay + Math.round(Math.random() * 30));
    })();
  }

  // --- Theme handling ---
  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
      if (themeCheckbox) themeCheckbox.checked = true;
    } else {
      document.body.classList.remove('light-mode');
      if (themeCheckbox) themeCheckbox.checked = false;
    }
    try { localStorage.setItem('interstellar_theme', theme); } catch (e) {}
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('interstellar_theme'); } catch (e) { saved = null; }
    if (!saved) {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      saved = prefersLight ? 'light' : 'dark';
    }
    applyTheme(saved);
  }

  // --- Loader / Start Button ---
  function showApp() {
    if (loader) {
      loader.style.transition = 'opacity 0.6s ease, visibility 0.6s ease';
      loader.style.opacity = '0';
      loader.style.pointerEvents = 'none';
      setTimeout(() => loader.classList.add('hidden'), 650);
    }
    if (app) {
      app.classList.remove('hidden');
      homeView.classList.add('active');
      browserView.classList.remove('active');
      animateOnce(homeView, 'fadeInUp');
    }
    startTypewriter();
  }

  // --- Browser / iframe handling ---
  function proxiedUrlFor(rawUrl) {
    try {
      const u = new URL(rawUrl, window.location.origin);
      rawUrl = u.href;
    } catch (e) {
      rawUrl = 'https://' + rawUrl;
    }
    const prox = `/proxy?url=${encodeURIComponent(rawUrl)}`;
    return { prox, direct: rawUrl };
  }

  function showBlockedMessage(url) {
    if (!blockedMsg) return;
    blockedMsg.classList.remove('hidden');
    const inner = blockedMsg.querySelector('.blocked-inner');
    if (!inner) return;
    const existing = inner.querySelector('.glow-btn[data-openlink]');
    if (existing) existing.remove();
    const openBtn = document.createElement('button');
    openBtn.className = 'glow-btn';
    openBtn.textContent = 'Im neuen Tab öffnen';
    openBtn.style.padding = '10px 18px';
    openBtn.setAttribute('data-openlink', '1');
    openBtn.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
    inner.appendChild(openBtn);
    animateOnce(blockedMsg, 'fadeInUp');
  }

  function hideBlockedMessage() {
    if (!blockedMsg) return;
    blockedMsg.classList.add('hidden');
    const inner = blockedMsg.querySelector('.blocked-inner');
    if (!inner) return;
    const existing = inner.querySelector('.glow-btn[data-openlink]');
    if (existing) existing.remove();
  }

  function openInBrowser(rawUrl) {
    if (!browserView || !homeView || !app) return;
    lastOpenedUrl = rawUrl;
    const { prox, direct } = proxiedUrlFor(rawUrl);
    homeView.classList.remove('active');
    homeView.classList.add('hidden');
    browserView.classList.remove('hidden');
    browserView.classList.add('active');
    if (currentUrlText) {
      try { currentUrlText.textContent = new URL(direct).hostname; } catch (e) { currentUrlText.textContent = direct; }
    }

    if (iframeLoader) iframeLoader.classList.remove('hidden');
    hideBlockedMessage();

    if (browserFrame) {
      browserFrame.src = 'about:blank';
      setTimeout(() => { browserFrame.src = prox; }, 40);
    }

    const TIMEOUT = 12000;
    if (iframeLoadTimeout) clearTimeout(iframeLoadTimeout);
    iframeLoadTimeout = setTimeout(() => {
      showBlockedMessage(direct);
      if (iframeLoader) iframeLoader.classList.add('hidden');
    }, TIMEOUT);
  }

  function closeBrowser() {
    if (!homeView || !browserView) return;
    browserView.classList.remove('active');
    browserView.classList.add('hidden');
    homeView.classList.remove('hidden');
    homeView.classList.add('active');
    if (browserFrame) browserFrame.src = 'about:blank';
    hideBlockedMessage();
  }

  // --- Event Listeners ---
  document.addEventListener('DOMContentLoaded', () => {
    if (!startBtn || !loader || !app) return;

    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      animateOnce(startBtn, 'fadeInUp');
      showApp();
    });

    gameCards.forEach((card) => {
      card.addEventListener('click', () => {
        const url = card.dataset.url || card.getAttribute('data-url') || card.getAttribute('href');
        if (!url) return;
        openInBrowser(url);
      });
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          card.click();
        }
      });
      card.setAttribute('tabindex', '0');
      card.style.cursor = 'pointer';
    });

    if (mainSearchBtn && mainSearchInput) {
      mainSearchBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const v = mainSearchInput.value.trim();
        if (!v) { animateOnce(mainSearchInput, 'shake'); return; }
        openInBrowser(v);
      });

      mainSearchInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); mainSearchBtn.click(); }
      });
    }

    if (backBtn) backBtn.addEventListener('click', closeBrowser);

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (browserFrame && browserFrame.src && !browserFrame.src.includes('about:blank')) {
          animateOnce(refreshBtn, 'fadeIn');
          try {
            const s = browserFrame.src;
            browserFrame.src = 'about:blank';
            setTimeout(() => { browserFrame.src = s; }, 60);
          } catch (e) {
            browserFrame.contentWindow && browserFrame.contentWindow.location.reload();
          }
        }
      });
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', async () => {
        const container = qs('.iframe-container') || (browserFrame && browserFrame.parentElement);
        if (!container) return;
        if (!document.fullscreenElement) {
          try { await container.requestFullscreen(); } catch (e) { console.warn('Fullscreen failed', e); }
        } else {
          await document.exitFullscreen();
        }
      });
    }

    if (browserFrame) {
      browserFrame.addEventListener('load', () => {
        if (iframeLoadTimeout) { clearTimeout(iframeLoadTimeout); iframeLoadTimeout = null; }
        if (iframeLoader) iframeLoader.classList.add('hidden');
        hideBlockedMessage();
        const cont = qs('.iframe-container');
        animateOnce(cont, 'fadeIn');
      });
      browserFrame.addEventListener('error', () => {
        if (iframeLoadTimeout) clearTimeout(iframeLoadTimeout);
        iframeLoadTimeout = null;
        if (iframeLoader) iframeLoader.classList.add('hidden');
        showBlockedMessage(lastOpenedUrl || window.location.href);
      });
    }

    if (themeCheckbox) {
      themeCheckbox.addEventListener('change', (ev) => {
        applyTheme(ev.target.checked ? 'light' : 'dark');
        animateOnce(document.body, 'fadeIn');
      });
    }
    initTheme();

    animateOnce(app, 'fadeInUp');
  });

  window.InterstellarUI = { openInBrowser, closeBrowser, applyTheme, startTypewriter };
})();
