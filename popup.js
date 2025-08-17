// --- In-frame popup toggle logic ---
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle_iframe_popup');
  if (!toggle) return;
  // Load state
  chrome.storage.sync.get(['thinkflow_iframe_enabled'], (result) => {
    const enabled = result.thinkflow_iframe_enabled !== false; // default true
    toggle.checked = enabled;
  });
  // On toggle
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ thinkflow_iframe_enabled: enabled }, () => {
      // Notify background to update all matching tabs
      chrome.runtime.sendMessage({ type: 'THINKFLOW_IFRAME_TOGGLE', enabled });
    });
  });
});
// Helper: Check if user is asking for code/solution
function isSolutionRequest(text) {
  const patterns = [
    /code/i,
    /solution/i,
    /implement/i,
    /write.*function/i,
    /give.*answer/i,
    /show.*code/i,
    /provide.*code/i,
    /full.*code/i,
    /entire.*code/i,
    /output.*code/i,
    /can you solve/i,
    /what is the answer/i
  ];
  return patterns.some(re => re.test(text));
}

// Gemini API call
function askGemini(messages, problemContext) {
  const context = {
    role: "user",
    parts: [
      { text: `You are a helpful DSA assistant. The user is working on this problem: ${problemContext}. Never provide code or a full solution. If the user asks for code or a solution, politely refuse and encourage insight or hints only.` }
    ]
  };
  const contents = [context, ...messages.map(m => ({ role: "user", parts: [{ text: m }] }))];
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "ASK_GEMINI", contents },
      (response) => {
        if (response?.success) {
          const parts = response.data?.candidates?.[0]?.content?.parts || [];
          resolve(parts.map(p => p.text).join("\n"));
        } else {
          reject(response?.error || "❌ Error contacting Gemini API.");
        }
      }
    );
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const titleDiv = document.getElementById('problem-title');
  const resourcesDiv = document.getElementById('resources');
  const actionButtonsDiv = document.getElementById('action-buttons');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    let problemInfo = {};

    // Only proceed if on a supported problem page
    if (/leetcode\.com\/problems\//.test(url) || /codeforces\.com\//.test(url)) {
      try {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PROBLEM_INFO' }, (response) => {
          if (chrome.runtime.lastError) {
            titleDiv.textContent = '⚠️ Could not connect to the page. Please refresh and try again.';
            return;
          }
          if (response && response.title) {
            problemInfo = { title: response.title, number: response.number, difficulty: response.difficulty };
            render(problemInfo, response.site || 'unknown');
          } else {
            titleDiv.textContent = '❌ Could not detect problem.';
          }
        });
      } catch (e) {
        titleDiv.textContent = '⚠️ Could not connect to the page.';
      }
    } else {
      titleDiv.textContent = '⚠️ Open this extension on a LeetCode or Codeforces problem page.';
    }

    function render(info, site) {
      // Choose logo based on site
      let logo = '';
      if (site === 'leetcode') {
        logo = '<img src="assets/icons/leetcode.png" alt="LeetCode" class="site-logo" />';
      } else if (site === 'codeforces') {
        logo = '<img src="assets/icons/codeforces.png" alt="Codeforces" class="site-logo" />';
      }

      // Difficulty dot (right side)
      let diffDot = '';
      if (info.difficulty) {
        let color = '#bbb', label = '';
        if (info.difficulty.includes('easy')) { color = '#4caf50'; label = 'E'; }
        else if (info.difficulty.includes('medium')) { color = '#ffc107'; label = 'M'; }
        else if (info.difficulty.includes('hard')) { color = '#f44336'; label = 'H'; }
        diffDot = `<span class="diff-dot" title="${info.difficulty.charAt(0).toUpperCase() + info.difficulty.slice(1)}" style="background:${color};color:#fff;font-weight:bold;">${label}</span>`;
      }

      titleDiv.innerHTML = `${logo}<span class="question-title-text">${info.title} ${info.number ? '(' + info.number + ')' : ''}</span><span style="flex:1"></span>${diffDot}`;

      // Reordered buttons - Ask AI first (primary), then secondary buttons
      actionButtonsDiv.innerHTML = `
        <button class="button primary" id="ask-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.7 0 3.3-.4 4.7-1.1L22 22l-1.1-5.3c.7-1.4 1.1-3 1.1-4.7 0-5.5-4.5-10-10-10z"/></svg>
          <span>Ask AI Assistant</span>
        </button>
        <button class="button secondary" id="yt-btn">
          <img src="assets/icons/youtube.png" alt="YouTube" class="inline-icon" />
          <span>YouTube Tutorials</span>
        </button>
        <button class="button secondary" id="res-btn">
          <img src="assets/icons/search_resources.png" alt="Resources" class="inline-icon" />
          <span>Find Resources</span>
        </button>
      `;

      document.getElementById('yt-btn').onclick = () => {
        const query = encodeURIComponent(info.title + ' ' + (site === 'leetcode' ? 'LeetCode' : site === 'codeforces' ? 'Codeforces' : ''));
        const url = `https://www.youtube.com/results?search_query=${query}`;
        chrome.tabs.create({ url });
      };

      document.getElementById('res-btn').onclick = () => {
        const query = encodeURIComponent(info.title + ' ' + (site === 'leetcode' ? 'LeetCode' : site === 'codeforces' ? 'Codeforces' : '') + ' resources');
        const url = `https://www.google.com/search?q=${query}`;
        chrome.tabs.create({ url });
      };

      document.getElementById('ask-btn').onclick = () => showAsk(info.title, site);
    }

    function showAsk(title, site) {
      // Only hide problem card and action buttons, not the whole main/header/footer
      actionButtonsDiv.style.display = 'none';
      const problemCard = document.getElementById('problem-card');
      if (problemCard) problemCard.style.display = 'none';

      const suggestedQs = [
        "What is the main goal of this problem?",
        "Can you explain the input and output format?",
        "What are the key constraints?",
        "What are common mistakes to avoid?"
      ];

      // Use the last rendered problemInfo for difficulty
      let diffDot = '';
      if (problemInfo && problemInfo.difficulty) {
        let color = '#bbb', label = '';
        if (problemInfo.difficulty.includes('easy')) { color = '#4caf50'; label = 'E'; }
        else if (problemInfo.difficulty.includes('medium')) { color = '#ffc107'; label = 'M'; }
        else if (problemInfo.difficulty.includes('hard')) { color = '#f44336'; label = 'H'; }
        diffDot = `<span class="diff-dot" title="${problemInfo.difficulty.charAt(0).toUpperCase() + problemInfo.difficulty.slice(1)}" style="background:${color};color:#fff;font-weight:bold;margin-left:8px;">${label}</span>`;
      }

      resourcesDiv.innerHTML = `
        <div class="ask-section">
          <div class="ask-header">
            <button class="ask-back-icon" id="ask-back-btn" title="Back" aria-label="Back">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span class="ask-title">${title}</span>
            ${diffDot}
          </div>
          <div class="ask-suggested" id="ask-suggested">
            <div class="ask-suggested-grid">
              ${suggestedQs.map(q => `<button class='ask-chip'>${q}</button>`).join('')}
            </div>
          </div>
          <div class="ask-content">
            <div class="ask-chat" id="ask-chat">
              <div class="ask-empty-state" id="ask-empty">
                <svg class="ask-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 10h.01M15 10h.01M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.7 0 3.3-.4 4.7-1.1L22 22l-1.1-5.3c.7-1.4 1.1-3 1.1-4.7 0-5.5-4.5-10-10-10z"/>
                </svg>
                <div class="ask-empty-title">Ask me anything about this problem</div>
                <div class="ask-empty-subtitle">I can help you understand the problem, suggest approaches, or clarify concepts.</div>
              </div>
            </div>
            <div class="ask-input-container">
              <div class="ask-input-row">
                <textarea id="ask-input" rows="1" placeholder="Ask me about this problem..."></textarea>
                <button class="send-icon-btn" id="send-ask" title="Send" aria-label="Send" disabled>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Add click handlers for suggested question chips
      document.querySelectorAll('.ask-chip').forEach(btn => {
        btn.onclick = () => {
          // Hide suggested chips and empty state
          const sugg = document.getElementById('ask-suggested');
          const empty = document.getElementById('ask-empty');
          if (sugg) sugg.style.display = 'none';
          if (empty) empty.style.display = 'none';

          const q = btn.textContent;
          document.getElementById('ask-input').value = '';
          // Send as if user typed it
          addMessage(q, 'user');
          addMessage('⏳ Thinking...', 'ai');
          chatHistory.push(q);
          askGemini(chatHistory, `${site === 'leetcode' ? 'LeetCode' : 'Codeforces'}: ${title}`)
            .then(answer => {
              const chatDiv = document.getElementById('ask-chat');
              chatDiv.removeChild(chatDiv.lastChild);
              addMessage(answer, 'ai');
            })
            .catch(() => {
              const chatDiv = document.getElementById('ask-chat');
              chatDiv.removeChild(chatDiv.lastChild);
              addMessage('❌ Error contacting Gemini API.', 'ai');
            });
        };
      });

      let chatHistory = [];
      const chatDiv = document.getElementById('ask-chat');

      function addMessage(text, from) {
        // Hide empty state if first message
        const empty = document.getElementById('ask-empty');
        if (empty) empty.style.display = 'none';

        const msgDiv = document.createElement('div');
        msgDiv.className = 'ask-msg ' + (from === 'user' ? 'ask-user' : 'ask-ai');
        if (from === 'ai') {
          msgDiv.innerHTML = `<div class="ask-bubble-text">${renderMarkdown(text)}</div>`;
        } else {
          msgDiv.innerHTML = `<div class="ask-bubble-text">${escapeHtml(text)}</div>`;
        }
        chatDiv.appendChild(msgDiv);

        // Only scroll when user sends a message
        if (from === 'user') {
          chatDiv.scrollTop = chatDiv.scrollHeight;
        }
      }

      // Input handling with modern UX
      const askInput = document.getElementById('ask-input');
      const sendAsk = document.getElementById('send-ask');

      // Enable/disable send button based on input
      askInput.addEventListener('input', () => {
        const hasText = askInput.value.trim().length > 0;
        sendAsk.disabled = !hasText;
      });

      // Auto-resize textarea
      askInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 80) + 'px';
      });

      sendAsk.onclick = async () => {
        const q = askInput.value.trim();
        if (!q || sendAsk.disabled) return;

        // Hide suggested chips if visible
        const sugg = document.getElementById('ask-suggested');
        if (sugg && sugg.style.display !== 'none') sugg.style.display = 'none';

        if (isSolutionRequest(q)) {
          addMessage("I'm not designed to give you code or a full solution, but I can help you understand the problem or give you hints! 🤔", 'ai');
          askInput.value = '';
          askInput.style.height = 'auto';
          sendAsk.disabled = true;
          return;
        }

        // Disable input during processing
        sendAsk.disabled = true;
        askInput.disabled = true;

        addMessage(q, 'user');
        askInput.value = '';
        askInput.style.height = 'auto';
        addMessage('⏳ Thinking...', 'ai');
        chatHistory.push(q);

        try {
          const answer = await askGemini(chatHistory, `${site === 'leetcode' ? 'LeetCode' : 'Codeforces'}: ${title}`);
          // Remove last (thinking...) and add real answer
          chatDiv.removeChild(chatDiv.lastChild);
          addMessage(answer, 'ai');
        } catch (e) {
          chatDiv.removeChild(chatDiv.lastChild);
          addMessage('❌ Error contacting Gemini API.', 'ai');
        } finally {
          // Re-enable input
          askInput.disabled = false;
          askInput.focus();
        }
      };

      askInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!sendAsk.disabled) sendAsk.click();
        }
      });

      // Minimal Markdown renderer for bold, italics, lists, and code
      function renderMarkdown(md) {
        let html = escapeHtml(md)
          .replace(/\\_/g, '_') // Unescape underscores
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code style="background:rgba(247,147,30,0.1);padding:2px 4px;border-radius:4px;font-size:0.9em;">$1</code>')
          .replace(/^\s*\* (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
          .replace(/\n{2,}/g, '</p><p style="margin:8px 0;">')
          .replace(/\n/g, '<br>');
        // Wrap <li> in <ul> if present
        if (/<li/.test(html)) html = '<ul style="margin:8px 0;padding-left:20px;">' + html + '</ul>';
        return '<div style="margin:0;">' + html + '</div>';
      }

      document.getElementById('ask-back-btn').onclick = () => {
        actionButtonsDiv.style.display = '';
        const problemCard = document.getElementById('problem-card');
        if (problemCard) problemCard.style.display = '';
        resourcesDiv.innerHTML = '';
      };
    }

    // Helper to escape HTML in Gemini responses
    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
      });
    }
  });
});
