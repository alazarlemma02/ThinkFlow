document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('modeForm');
  const successMsg = document.getElementById('successMsg');
  const btnPopup = document.getElementById('btn_popup');
  const btnIframe = document.getElementById('btn_iframe');
  const modeInput = document.getElementById('mode_input');

  // Floating widget toggle
  const toggleIframe = document.getElementById('toggle_iframe_popup');
  const toggleStatus = document.getElementById('toggle_iframe_status');

  // Load saved mode
  chrome.storage.sync.get(['thinkflow_mode'], (result) => {
    if (result.thinkflow_mode === 'iframe') {
      btnIframe.classList.add('selected');
      btnPopup.classList.remove('selected');
      modeInput.value = 'iframe';
    } else {
      btnPopup.classList.add('selected');
      btnIframe.classList.remove('selected');
      modeInput.value = 'popup';
    }
  });

  // Load saved toggle state
  chrome.storage.sync.get(['thinkflow_iframe_enabled'], (result) => {
    const enabled = result.thinkflow_iframe_enabled !== false; // default true
    toggleIframe.checked = enabled;
    toggleStatus.textContent = enabled ? 'Enabled' : 'Disabled';
  });

  toggleIframe.addEventListener('change', () => {
    const enabled = toggleIframe.checked;
    chrome.storage.sync.set({ thinkflow_iframe_enabled: enabled }, () => {
      toggleStatus.textContent = enabled ? 'Enabled' : 'Disabled';
    });
  });

  btnPopup.addEventListener('click', () => {
    btnPopup.classList.add('selected');
    btnIframe.classList.remove('selected');
    modeInput.value = 'popup';
  });
  btnIframe.addEventListener('click', () => {
    btnIframe.classList.add('selected');
    btnPopup.classList.remove('selected');
    modeInput.value = 'iframe';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mode = modeInput.value;
    chrome.storage.sync.set({ thinkflow_mode: mode }, () => {
      successMsg.style.display = 'block';
      setTimeout(() => {
        alert('Preference saved! You can now continue using ThinkFlow.');
        window.close();
      }, 800);
    });
  });
});
