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

function setFormLoading(isLoading, btn) {
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

function setupAmountInput() {
  const amountInput = document.getElementById('amount');
  const amountHint = document.getElementById('amountHint');
  if (!amountInput) return;

  // Prevent decimals and non-numeric input
  amountInput.addEventListener('input', (e) => {
    // Remove any non-digit characters
    let value = e.target.value.replace(/[^\d]/g, '');
    // Limit to 100000
    if (value && parseInt(value) > 100000) {
      value = '100000';
    }
    e.target.value = value;
  });

  // Prevent decimal point and minus on keypress
  amountInput.addEventListener('keypress', (e) => {
    if (e.key === '.' || e.key === '-' || e.key === 'e' || e.key === '+') {
      e.preventDefault();
    }
  });

  // Show error hint if below minimum
  amountInput.addEventListener('blur', () => {
    const value = parseInt(amountInput.value);
    if (amountInput.value && value < 1) {
      amountHint.textContent = 'MINIMUM $1';
      amountHint.style.color = '#FF3B3B';
    } else {
      amountHint.textContent = 'USD, $1 - $100,000';
      amountHint.style.color = '';
    }
  });
}

// ==================== PAYMENT FLOW ====================

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
    throw new Error(text || 'Failed to create PayPal order');
  }

  return await res.json();
}

async function createCryptoInvoice(nick, amount) {
  const res = await fetch('/api/create-crypto-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick, amount }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to create crypto invoice');
  }

  return await res.json();
}

function mockDonate(nick, amount) {
  const existing = FALLBACK_LEADERBOARD.top.find(
    entry => entry.nick.toLowerCase() === nick.toLowerCase()
  );

  if (existing) {
    existing.total += amount;
  } else {
    FALLBACK_LEADERBOARD.top.push({ nick, total: amount });
  }

  FALLBACK_LEADERBOARD.top.sort((a, b) => b.total - a.total);
  renderLeaderboard(FALLBACK_LEADERBOARD);

  return { success: true, nick, amount };
}

function getFormValues() {
  const nickInput = document.getElementById('nick');
  const amountInput = document.getElementById('amount');

  const nick = sanitizeNick(nickInput.value);
  const amount = normalizeAmount(amountInput.value);

  if (!nick) {
    showFormError(ERROR_MESSAGES.INVALID_NICK);
    nickInput.focus();
    return null;
  }

  if (amount === null) {
    showFormError(ERROR_MESSAGES.INVALID_AMOUNT);
    amountInput.focus();
    return null;
  }

  return { nick, amount };
}

async function handleCryptoPayment() {
  const values = getFormValues();
  if (!values) return;

  const btn = document.getElementById('payCrypto');
  try {
    setFormLoading(true, btn);

    if (!navigator.onLine) throw new Error('NETWORK');

    if (isMockMode) {
      mockDonate(values.nick, values.amount);
      closeDonateModal();
      return;
    }

    const { checkoutUrl } = await createCryptoInvoice(values.nick, values.amount);

    if (!checkoutUrl) throw new Error('No checkout URL returned');

    window.location.href = checkoutUrl;
  } catch (error) {
    setFormLoading(false, btn);
    console.error('Crypto payment error:', error);

    if (error.message === 'NETWORK' || !navigator.onLine) {
      showFormError(ERROR_MESSAGES.NETWORK);
    } else {
      showFormError(ERROR_MESSAGES.UNKNOWN);
    }
  }
}

async function handleDonateSubmit(e) {
  e.preventDefault();

  const values = getFormValues();
  if (!values) return;

  const btn = document.querySelector('.btn-paypal');
  try {
    setFormLoading(true, btn);

    if (!navigator.onLine) throw new Error('NETWORK');

    if (isMockMode) {
      mockDonate(values.nick, values.amount);
      closeDonateModal();
      return;
    }

    const { approveUrl } = await createPayPalOrder(values.nick, values.amount);

    if (!approveUrl) throw new Error('No approval URL returned');

    window.location.href = approveUrl;
  } catch (error) {
    setFormLoading(false, btn);
    console.error('Donation error:', error);

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
let currentPage = 1;
const itemsPerPage = 20;

function renderLeaderboard(data) {
  const list = document.querySelector('.list');
  const current = data.top || [];
  const totalItems = current.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Calculate slice indices for current page
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const pageItems = current.slice(startIdx, endIdx);

  // Create new items
  const newItems = pageItems.map((row, pageIdx) => {
    const rank = startIdx + pageIdx + 1;
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
      <span class="name">${row.nick}</span><span class="dots">........................................</span>
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

  // Update pagination controls
  updatePagination(totalPages, totalItems);
}

function updatePagination(totalPages, totalItems) {
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');

  if (!pagination || !prevBtn || !nextBtn || !pageInfo) return;

  // Show pagination only if more than one page
  if (totalPages > 1) {
    pagination.hidden = false;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    pageInfo.textContent = `PAGE ${currentPage} OF ${totalPages}`;
  } else {
    pagination.hidden = true;
  }
}

function goToPage(page) {
  const totalPages = Math.ceil(previousLeaderboard.length / itemsPerPage);
  if (page < 1 || page > totalPages) return;

  currentPage = page;
  pollLeaderboard();
}

// Fallback data when API is unavailable
const FALLBACK_LEADERBOARD = {
  top: [
    { nick: 'DRL', total: 999975 },
    { nick: 'SAM', total: 18315 },
    { nick: 'YOU', total: 14010 },
    { nick: 'PGD', total: 12285 },
    { nick: 'CRB', total: 10520 },
    { nick: 'MRS', total: 9015 },
    { nick: 'ZSR', total: 7265 },
    { nick: 'TMH', total: 5010 },
  ]
};

let hasLoadedOnce = false;

async function pollLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    hasLoadedOnce = true;
    renderLeaderboard(data);
  } catch (e) {
    console.error('Leaderboard fetch failed:', e);
    // Show fallback data if never loaded successfully
    if (!hasLoadedOnce) {
      renderLeaderboard(FALLBACK_LEADERBOARD);
    }
  }
}

// ==================== INITIALIZATION ====================

let pollTimer = null;

function startPolling() {
  // In mock mode, just render fallback data and don't poll API
  if (isMockMode) {
    renderLeaderboard(FALLBACK_LEADERBOARD);
    return;
  }

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

  // Close on ESC key + pagination keyboard navigation
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('donateModal');

    if (e.key === 'Escape') {
      if (modal && !modal.hidden) {
        closeDonateModal();
      }
    }

    // Arrow key navigation for pagination (only when modal is closed)
    if (modal && modal.hidden) {
      if (e.key === 'ArrowLeft') {
        goToPage(currentPage - 1);
      } else if (e.key === 'ArrowRight') {
        goToPage(currentPage + 1);
      }
    }
  });

  // Form submit (PayPal button)
  const donateForm = document.getElementById('donateForm');
  if (donateForm) {
    donateForm.addEventListener('submit', handleDonateSubmit);
  }

  // Crypto button
  const cryptoBtn = document.getElementById('payCrypto');
  if (cryptoBtn) {
    cryptoBtn.addEventListener('click', handleCryptoPayment);
  }

  // Setup nick check
  setupNickCheck();

  // Setup amount input validation
  setupAmountInput();

  // Setup pagination
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => goToPage(currentPage + 1));
  }

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
