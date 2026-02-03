// ==================== VALIDATION ====================

function sanitizeNick(nick) {
  return String(nick || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);
}

function normalizeAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.floor(n);
  if (rounded < 1) return null;
  if (rounded > 100000) return null;
  return rounded;
}

// ==================== ERROR HANDLING ====================

const ERROR_MESSAGES = {
  NETWORK: 'Connection failed. Check your internet and try again.',
  INVALID_NICK: 'Player name must be 1-24 characters (A-Z, 0-9, _, - only)',
  INVALID_AMOUNT: 'Amount must be between $1 and $100,000',
  PAYPAL_ERROR: 'PayPal error. Please try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

function showFormError(message) {
  const errorEl = document.getElementById('formError');
  errorEl.textContent = message;

  setTimeout(() => {
    errorEl.textContent = '';
  }, 5000);
}

function setFormLoading(isLoading) {
  const btn = document.querySelector('.btn-primary');
  const status = document.getElementById('formStatus');

  if (isLoading) {
    btn.classList.add('loading');
    btn.disabled = true;
    status.textContent = 'Processing payment...';
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
    status.textContent = '';
  }
}

// ==================== MODAL MANAGEMENT ====================

let donateButton = null;

function trapFocus(e) {
  if (e.key !== 'Tab') return;

  const modal = document.getElementById('donateModal');
  const focusable = modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function openDonateModal() {
  const modal = document.getElementById('donateModal');
  modal.hidden = false;

  // Update modal title if in mock mode
  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle && isMockMode) {
    modalTitle.textContent = 'DONATE (TEST MODE)';
  }

  // Update button text if in mock mode
  const submitBtn = modal.querySelector('.btn-primary');
  if (submitBtn && isMockMode) {
    submitBtn.textContent = 'TEST DONATE';
  }

  // Focus first input
  const firstInput = modal.querySelector('input');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 150);
  }

  // Trap focus within modal
  modal.addEventListener('keydown', trapFocus);
}

function closeDonateModal() {
  const modal = document.getElementById('donateModal');

  // Add closing animation
  modal.classList.add('closing');

  // Wait for animation to complete
  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove('closing');
    modal.removeEventListener('keydown', trapFocus);

    // Clear form
    const form = document.getElementById('donateForm');
    form.reset();
    showFormError('');
    setFormLoading(false);

    // Reset modal title
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
      modalTitle.textContent = 'DONATE';
    }

    // Reset button text
    const submitBtn = modal.querySelector('.btn-primary');
    if (submitBtn) {
      submitBtn.textContent = 'DONATE NOW';
    }

    // Return focus to trigger button
    if (donateButton) {
      donateButton.focus();
    }
  }, 250); // Match animation duration
}

// ==================== NICKNAME CHECK ====================

async function checkNickExists(nick) {
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    const existing = data.top?.find(entry => entry.nick.toLowerCase() === nick.toLowerCase());
    return existing ? existing.total : null;
  } catch (e) {
    console.error('Failed to check nick:', e);
    return null;
  }
}

function setupNickCheck() {
  const nickInput = document.getElementById('nick');
  const nickHint = document.getElementById('nickHint');

  if (!nickInput || !nickHint) return;

  let checkTimeout;

  nickInput.addEventListener('input', () => {
    clearTimeout(checkTimeout);

    const nick = sanitizeNick(nickInput.value);
    if (nick.length < 2) {
      nickHint.textContent = 'MAX 24, A-Z, 0-9, _ - ONLY';
      nickHint.style.color = '';
      return;
    }

    checkTimeout = setTimeout(async () => {
      const existingTotal = await checkNickExists(nick);
      if (existingTotal !== null) {
        nickHint.textContent = `ALREADY DONATED: $${Math.floor(existingTotal)}. ADD MORE?`;
        nickHint.style.color = 'var(--gold)';
      } else {
        nickHint.textContent = 'MAX 24, A-Z, 0-9, _ - ONLY';
        nickHint.style.color = '';
      }
    }, 500);
  });
}

// ==================== PAYPAL FLOW ====================

// Check if mock mode is enabled via URL parameter
const isMockMode = new URLSearchParams(window.location.search).has('mock');

async function createPayPalOrder(nick, amount) {
  const res = await fetch('/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick, amount }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to create order');
  }

  return await res.json();
}

async function mockDonate(nick, amount) {
  const res = await fetch('/api/mock-donate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick, amount }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Mock donation failed');
  }

  return await res.json();
}

async function handleDonateSubmit(e) {
  e.preventDefault();

  const nickInput = document.getElementById('nick');
  const amountInput = document.getElementById('amount');

  const nickRaw = nickInput.value;
  const amountRaw = amountInput.value;

  const nick = sanitizeNick(nickRaw);
  const amount = normalizeAmount(amountRaw);

  // Validation
  if (!nick) {
    showFormError(ERROR_MESSAGES.INVALID_NICK);
    nickInput.focus();
    return;
  }

  if (amount === null) {
    showFormError(ERROR_MESSAGES.INVALID_AMOUNT);
    amountInput.focus();
    return;
  }

  try {
    setFormLoading(true);

    // Check network connectivity
    if (!navigator.onLine) {
      throw new Error('NETWORK');
    }

    if (isMockMode) {
      // Mock mode: instantly add donation without PayPal
      await mockDonate(nick, amount);

      // Close modal and show success
      closeDonateModal();

      // Trigger immediate leaderboard refresh
      setTimeout(() => {
        pollLeaderboard();
      }, 500);

    } else {
      // Real mode: redirect to PayPal
      const { approveUrl } = await createPayPalOrder(nick, amount);

      if (!approveUrl) {
        throw new Error('No approval URL returned');
      }

      // Redirect to PayPal
      window.location.href = approveUrl;
    }

  } catch (error) {
    setFormLoading(false);

    console.error('Donation error:', error);

    // Determine error message
    if (error.message === 'NETWORK' || !navigator.onLine) {
      showFormError(ERROR_MESSAGES.NETWORK);
    } else if (error.message.toLowerCase().includes('nick')) {
      showFormError(ERROR_MESSAGES.INVALID_NICK);
    } else if (error.message.toLowerCase().includes('amount')) {
      showFormError(ERROR_MESSAGES.INVALID_AMOUNT);
    } else if (error.message.includes('502') || error.message.includes('PayPal')) {
      showFormError(ERROR_MESSAGES.PAYPAL_ERROR);
    } else {
      showFormError(ERROR_MESSAGES.UNKNOWN);
    }
  }
}

// ==================== LEADERBOARD ====================

let previousLeaderboard = [];

function renderLeaderboard(data) {
  const list = document.querySelector('.list');
  const current = data.top || [];

  // Create new items
  const newItems = current.map((row, idx) => {
    const rank = idx + 1;
    const isFirst = rank === 1;

    // Check if this is a new entry or score changed
    const prevEntry = previousLeaderboard.find(p => p.nick === row.nick);
    const isNew = !prevEntry;
    const scoreChanged = prevEntry && prevEntry.total !== row.total;

    const li = document.createElement('li');
    li.className = isFirst ? 'row first' : 'row';
    li.dataset.nick = row.nick;

    // Add animation classes
    if (isNew) {
      li.classList.add('row-new');
    }

    li.innerHTML = `
      <span class="rank">${rank}.</span>
      <span class="name">${row.nick}</span>
      <span class="score${scoreChanged ? ' score-bump' : ''}">$${Math.floor(row.total)}</span>
    `;

    return li;
  });

  // Replace all children at once (prevents flicker)
  list.replaceChildren(...newItems);

  // Remove score-bump class after animation
  setTimeout(() => {
    list.querySelectorAll('.score-bump').forEach(el => {
      el.classList.remove('score-bump');
    });
  }, 300);

  // Store current data for next comparison
  previousLeaderboard = current.map(r => ({ nick: r.nick, total: r.total }));
}

async function pollLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    renderLeaderboard(data);
  } catch (e) {
    // Don't show error to user, just log
    console.error('Leaderboard fetch failed:', e);
  }
}

// ==================== INITIALIZATION ====================

let pollTimer = null;

function startPolling() {
  // Initial load
  pollLeaderboard();

  // Auto-refresh every 4 seconds
  pollTimer = setInterval(pollLeaderboard, 4000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function init() {
  // Log mode
  if (isMockMode) {
    console.log('🧪 MOCK MODE ENABLED - donations will be added instantly without PayPal');
    console.log('💡 Remove ?mock=1 from URL to use real PayPal integration');
  }

  // Get donate button
  donateButton = document.querySelector('.btn');

  if (!donateButton) {
    console.error('Donate button not found');
    return;
  }

  // Event listeners
  donateButton.addEventListener('click', openDonateModal);

  const modalCloseBtn = document.querySelector('.modal-close');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeDonateModal);
  }

  const donateModal = document.getElementById('donateModal');
  if (donateModal) {
    // Close on backdrop click
    donateModal.addEventListener('click', (e) => {
      if (e.target.id === 'donateModal') {
        closeDonateModal();
      }
    });
  }

  // Close on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('donateModal');
      if (modal && !modal.hidden) {
        closeDonateModal();
      }
    }
  });

  // Form submit
  const donateForm = document.getElementById('donateForm');
  if (donateForm) {
    donateForm.addEventListener('submit', handleDonateSubmit);
  }

  // Setup nick check
  setupNickCheck();

  // Start polling leaderboard
  startPolling();

  // Pause polling when tab hidden (save bandwidth)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  });
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
