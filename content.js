// Sends chrome.runtime messages:
//  - outgoing: { type: 'PROBLEM_DETECTED', payload: { site, title, number, url, raw } }
//  - responds to incoming: { type: 'GET_PROBLEM_INFO' } -> returns latest problem or null

(function () {
  'use strict';

  // --- state ---
  let latestProblem = null;

  // --- Floating Widget Injection ---
  const WIDGET_ID = '__thinkflow_widget_iframe';
  const BUTTON_ID = '__thinkflow_floating_btn';

  function injectFloatingButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.title = 'Open ThinkFlow';
    btn.style.position = 'fixed';
    btn.style.bottom = '32px';
    btn.style.right = '32px';
    btn.style.zIndex = '2147483647';
    btn.style.width = '56px';
    btn.style.height = '56px';
    btn.style.borderRadius = '50%';
    btn.style.background = 'linear-gradient(135deg, #75747290 0%, #75747290 100%)';
    btn.style.boxShadow = '0 4px 24px rgba(26,26,64,0.18)';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.transition = 'box-shadow 0.2s, filter 0.2s';
    btn.addEventListener('mouseenter', () => {
      btn.style.boxShadow = '0 0 0 6px #F7931E55, 0 8px 32px rgba(26,26,64,0.28)';
      btn.style.filter = 'brightness(1.08)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.boxShadow = '0 4px 24px rgba(26,26,64,0.18)';
      btn.style.filter = 'none';
    });
    btn.addEventListener('click', toggleWidgetIframe);

    // Add logo image
    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('assets/icons/icon-128.png');
    logo.alt = 'ThinkFlow';
    logo.style.width = '45px';
    logo.style.height = '45px';
    logo.style.objectFit = 'contain';
    logo.style.display = 'block';
    btn.appendChild(logo);

    document.body.appendChild(btn);
  }

  function toggleWidgetIframe() {
    const iframe = document.getElementById(WIDGET_ID);
    const closeBtn = document.getElementById(WIDGET_ID + '_close');
    if (iframe && closeBtn) {
      iframe.remove();
      closeBtn.remove();
    } else {
      injectWidgetIframe();
    }
  }

  function injectWidgetIframe() {
    if (document.getElementById(WIDGET_ID)) return;
    const iframe = document.createElement('iframe');
    iframe.id = WIDGET_ID;
    iframe.src = chrome.runtime.getURL('popup.html');
    iframe.style.position = 'fixed';
    iframe.style.bottom = '100px';
    iframe.style.right = '40px';
    iframe.style.width = '420px';
    iframe.style.height = '500px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '18px';
    iframe.style.boxShadow = '0 8px 32px rgba(26,26,64,0.18)';
    iframe.style.zIndex = '2147483647';
    iframe.style.background = 'transparent';
    iframe.style.transition = 'opacity 0.2s';
    iframe.allow = 'clipboard-write;';

    // Add a close button overlay
    const closeBtn = document.createElement('button');
    closeBtn.id = WIDGET_ID + '_close';
    closeBtn.innerText = '×';
    closeBtn.title = 'Close ThinkFlow';
    closeBtn.style.position = 'fixed';
    closeBtn.style.bottom = '580px';
    closeBtn.style.right = '420px';
    closeBtn.style.width = '36px';
    closeBtn.style.height = '36px';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.background = '#fff';
    closeBtn.style.color = '#F7931E';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.fontSize = '1.6em';
    closeBtn.style.boxShadow = '0 2px 8px rgba(26,26,64,0.10)';
    closeBtn.style.border = 'none';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.zIndex = '2147483648';
    closeBtn.addEventListener('click', () => {
      iframe.remove();
      closeBtn.remove();
    });

    document.body.appendChild(iframe);
    document.body.appendChild(closeBtn);
  }

  // Inject button on page load
  // Only inject floating button if user selected 'iframe' mode
  function maybeInjectFloatingButton() {
    chrome.storage.sync.get(['thinkflow_mode'], (result) => {
      if (result.thinkflow_mode === 'iframe') {
        injectFloatingButton();
      }
    });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    maybeInjectFloatingButton();
  } else {
    window.addEventListener('DOMContentLoaded', maybeInjectFloatingButton);
  }

  // --- LeetCode selector candidates (old + new + fallbacks) ---
  const LEETCODE_SELECTORS = [
    'h1[data-cy="question-title"]',
    'div[data-cy="question-title"]',
    '.text-title-large.font-medium',
    '.question-title h3',
    '.question-title',
    '.css-v3d350 h1',
    '.question__title',
    '.css-10o4wqw',
    '.css-1v3d3zu',
  ];

  // --- Codeforces selector candidates ---
  const CODEFORCES_SELECTORS = [
    '.problem-statement .title',
    '.title',
    '.problemindexholder .title',
    '.problem-name',
    '.problem-statement h2',
    'h1'
  ];

  // Helper: get text from an array of selectors
  function getTextFromSelectors(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim()) {
          return el.textContent.trim();
        }
      } catch (e) {
      }
    }
    return null;
  }

  function tryMetaOrDocTitle() {
    const meta =
      document.querySelector('meta[property="og:title"]') ||
      document.querySelector('meta[name="twitter:title"]');
    if (meta && meta.content) return meta.content.trim();
    if (document.title) return document.title.trim();
    return null;
  }

  function parseLeetCodeText(fullText) {
    if (!fullText) return { number: null, title: null };

    let text = fullText.replace(/\s*[-|–|—|·|•]\s*LeetCode.*$/i, '').trim();

    let m = text.match(/^#?(\d{1,6})[.)\-\s:]+\s*(.+)$/);
    if (m) return { number: m[1], title: m[2].trim() };

    return { number: null, title: text.trim() };
  }

  // LeetCode extractor
  function getLeetCodeProblem() {
    let text = getTextFromSelectors(LEETCODE_SELECTORS);
    if (!text) text = tryMetaOrDocTitle();
    if (!text) return null;

    let difficulty = null;
    let badge = document.querySelector('.difficulty-label, .text-difficulty, .css-1n6g4vv, .css-1n6g4vv span');
    if (badge && badge.textContent) {
      difficulty = badge.textContent.trim().toLowerCase();
    }
    if (!difficulty) {
      const all = document.querySelectorAll('.css-10o4wqw span, .css-1v3d3zu span, span');
      for (const el of all) {
        if (el.classList && Array.from(el.classList).some(cls => cls.startsWith('rounded-') && cls.includes('21px'))) {
          const txt = el.textContent.trim().toLowerCase();
          if (['easy','medium','hard'].includes(txt)) {
            difficulty = txt;
            break;
          }
        }
      }
    }
    if (!difficulty) {
      const meta = document.querySelector('meta[name="difficulty"]');
      if (meta && meta.content) difficulty = meta.content.trim().toLowerCase();
    }
    async function fetchLeetCodeDifficulty(titleSlug) {
      const query = `query questionData($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty } }`;
      try {
        const resp = await fetch('https://leetcode.com/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { titleSlug } })
        });
        const json = await resp.json();
        return json.data && json.data.question && json.data.question.difficulty ? json.data.question.difficulty.toLowerCase() : null;
      } catch (e) { return null; }
    }
    if (!difficulty) {
      const m = window.location.pathname.match(/\/problems\/([\w-]+)\//);
      if (m && m[1]) {
        fetchLeetCodeDifficulty(m[1]).then(diff => {
          if (diff && latestProblem && !latestProblem.difficulty) {
            latestProblem.difficulty = diff;
            try { chrome.runtime.sendMessage({ type: 'PROBLEM_DETECTED', payload: latestProblem }); } catch (e) {}
          }
        });
      }
    }

    const parsed = parseLeetCodeText(text);
    return {
      site: 'leetcode',
      title: parsed.title || null,
      number: parsed.number,
      raw: text,
      url: location.href,
      difficulty: difficulty
    };
  }

  // Codeforces extractor
  function getCodeforcesProblem() {
    let title = getTextFromSelectors(CODEFORCES_SELECTORS) || tryMetaOrDocTitle();
    if (!title) return null;
    title = title.replace(/\s*[-|–|—].*$/, '').trim();

    const path = window.location.pathname;
    let number = null;
    let m;

    m = path.match(/\/contest\/(\d+)\/problem\/([A-Za-z]\d?)/i);
    if (m) number = `${m[1]}${m[2].toUpperCase()}`;

    if (!number) {
      m = path.match(/\/problemset\/problem\/(\d+)\/([A-Za-z]\d?)/i);
      if (m) number = `${m[1]}${m[2].toUpperCase()}`;
    }

    if (!number) {
      m = path.match(/\/problem\/(\d+)\/([A-Za-z]\d?)/i);
      if (m) number = `${m[1]}${m[2].toUpperCase()}`;
    }

    return {
      site: 'codeforces',
      title: title || null,
      number: number,
      raw: title,
      url: location.href
    };
  }

  function detectProblemNow() {
    const host = window.location.hostname || '';
    if (host.includes('leetcode')) {
      return getLeetCodeProblem();
    }
    if (host.includes('codeforces')) {
      return getCodeforcesProblem();
    }
    return null;
  }

  function sameProblem(a, b) {
    if (!a || !b) return false;
    return a.site === b.site && (a.title === b.title) && (a.number === b.number);
  }

  function notifyIfChanged(problem) {
    if (!problem) return;
    if (!latestProblem || !sameProblem(latestProblem, problem)) {
      latestProblem = problem;
      try {
        chrome.runtime.sendMessage({ type: 'PROBLEM_DETECTED', payload: problem });
      } catch (e) {
      }
      console.debug('[dsa-helper] PROBLEM_DETECTED', problem);
    }
  }

  // Throttle helper to avoid spamming checks
  function throttle(fn, wait) {
    let t = null;
    return function (...args) {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        fn.apply(this, args);
      }, wait);
    };
  }

  // Main check function
  const checkProblem = throttle(() => {
    const p = detectProblemNow();
    if (p && p.title) {
      notifyIfChanged(p);
    } else {
      console.debug('[dsa-helper] checkProblem: no problem detected yet.');
    }
  }, 200);

  // --- Respond to popup/background requests ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'GET_PROBLEM_INFO') {
      sendResponse(latestProblem || null);
    }
    return true;
  });

  // --- SPA navigation detection (pushState/replaceState/popstate) ---
  (function () {
    const _wr = function (type) {
      const orig = history[type];
      return function () {
        const rv = orig.apply(this, arguments);
        window.dispatchEvent(new Event('locationchange'));
        return rv;
      };
    };
    history.pushState = _wr('pushState');
    history.replaceState = _wr('replaceState');
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('locationchange', () => {
      setTimeout(() => checkProblem(), 120);
    });
  })();

  // --- MutationObserver to catch dynamic DOM injection ---
  const observer = new MutationObserver(() => {
    checkProblem();
  });

  // Start observing body (if available) and run initial check
  function startObserver() {
    if (document && document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      checkProblem();
    } else {
      setTimeout(startObserver, 100);
    }
  }
  startObserver();

  try {
    window.__dsa_helper_get_latest = () => latestProblem;
  } catch (e) {}

})();
