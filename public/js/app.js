/**
 * MONEYSTEP - Financial Goal Tracker JavaScript Controller
 * Handled features: JWT session logic, client SPA state, calculations, motivational updates,
 * and live exchange rate API sync.
 */

// Application State
const state = {
  token: localStorage.getItem('moneystep_token') || null,
  user: null,
  goal: null,
  rates: {
    TRY: 0,
    EUR: 0,
    GBP: 0
  }
};

// --- DOM ELEMENTS ---
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginCard = document.getElementById('login-card');
const registerCard = document.getElementById('register-card');

// Forms
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const goalForm = document.getElementById('goal-form');

// Toggle buttons
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');
const logoutBtn = document.getElementById('logout-btn');

// Display Fields
const userDisplayName = document.getElementById('user-display-name');
const progressEmptyState = document.getElementById('progress-empty-state');
const progressActiveState = document.getElementById('progress-active-state');

// Goal Metrics Elements
const radialBar = document.getElementById('radial-bar');
const percentVal = document.getElementById('percent-val');
const pbPercent = document.getElementById('pb-percent');
const pbFill = document.getElementById('pb-fill');
const remainingVal = document.getElementById('remaining-val');
const daysVal = document.getElementById('days-val');
const monthsVal = document.getElementById('months-val');

// Motivation Elements
const motivationBox = document.getElementById('motivation-box');
const motivationTitle = document.getElementById('motivation-title');
const motivationDesc = document.getElementById('motivation-desc');

// Currency elements
const usdTryEl = document.getElementById('rate-usd-try');
const eurUsdEl = document.getElementById('rate-eur-usd');
const gbpUsdEl = document.getElementById('rate-gbp-usd');
const convEurEl = document.getElementById('conv-eur');
const convTryEl = document.getElementById('conv-try');

// Toast Notification System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'x-circle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons(); // Initialize Lucide Icons for dynamic element

  // Animate and self-destruct
  setTimeout(() => {
    toast.classList.add('toast-closing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

// --- VIEW ROUTER ---
function updateView() {
  if (state.token) {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    userDisplayName.textContent = state.user ? state.user.username : 'User';
    initDashboard();
  } else {
    dashboardSection.classList.add('hidden');
    authSection.classList.remove('hidden');
  }
  lucide.createIcons();
}

// Switch between Login and Register Cards
showRegisterLink.addEventListener('click', (e) => {
  e.preventDefault();
  loginCard.classList.remove('active-card');
  registerCard.classList.add('active-card');
});

showLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  registerCard.classList.remove('active-card');
  loginCard.classList.add('active-card');
});


// --- AUTHENTICATION ACTIONS ---

// Register Submit
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;

  if (password !== confirmPassword) {
    showToast('Passwords do not match.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    showToast('Registration successful! Welcome to MONEYSTEP.', 'success');
    loginUser(data.token, data.user);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Login Submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    showToast('Signed in successfully!', 'success');
    loginUser(data.token, data.user);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Helper: Cache state and login user
function loginUser(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('moneystep_token', token);
  
  // Clear forms
  loginForm.reset();
  registerForm.reset();
  
  updateView();
}

// Logout Action
logoutBtn.addEventListener('click', () => {
  state.token = null;
  state.user = null;
  state.goal = null;
  localStorage.removeItem('moneystep_token');
  
  // Reset Goal UI to initial empty state
  progressActiveState.classList.add('hidden');
  progressEmptyState.classList.remove('hidden');
  goalForm.reset();
  
  showToast('Logged out successfully.', 'info');
  updateView();
});

// Fetch current user details
async function fetchMe() {
  if (!state.token) return;
  try {
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (res.ok) {
      state.user = data.user;
    } else {
      // Invalid/Expired Token
      localStorage.removeItem('moneystep_token');
      state.token = null;
      showToast('Session expired. Please log in again.', 'info');
    }
  } catch (err) {
    console.error('Error fetching user:', err);
  }
  updateView();
}


// --- GOAL LOGIC & CALCULATIONS ---

// Handle goal submission
goalForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const target_amount = parseFloat(document.getElementById('target-amount').value);
  const current_savings = parseFloat(document.getElementById('current-savings').value);
  const daily_saving = parseFloat(document.getElementById('daily-saving').value);

  if (target_amount <= current_savings) {
    showToast('Your target goal must be greater than current savings.', 'error');
    return;
  }

  // Pre-calculate locally for instant UX responsiveness
  renderGoalMetrics({
    target_amount,
    current_savings,
    daily_saving,
    remaining_amount: Math.max(0, target_amount - current_savings),
    days_needed: Math.ceil((target_amount - current_savings) / daily_saving),
    months_needed: parseFloat(((target_amount - current_savings) / daily_saving / 30).toFixed(1)),
    progress_percent: parseFloat(((current_savings / target_amount) * 100).toFixed(1))
  });

  // Sync to database
  try {
    const res = await fetch('/api/goal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ target_amount, current_savings, daily_saving })
    });
    const data = await res.json();
    if (res.ok) {
      state.goal = data.goal;
      showToast('Savings goal saved and updated successfully.', 'success');
      renderGoalMetrics(data.goal);
    } else {
      throw new Error(data.error || 'Failed to save goal');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Render calculations results on the UI
function renderGoalMetrics(goal) {
  if (!goal) {
    progressActiveState.classList.add('hidden');
    progressEmptyState.classList.remove('hidden');
    return;
  }

  progressEmptyState.classList.add('hidden');
  progressActiveState.classList.remove('hidden');

  // Format values
  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  
  // Clean currency symbols from label outputs depending on currency choice, but use a clean representation
  remainingVal.textContent = formatter.format(goal.remaining_amount);
  daysVal.textContent = goal.days_needed.toLocaleString();
  monthsVal.textContent = goal.months_needed.toLocaleString();
  
  percentVal.textContent = `${goal.progress_percent}%`;
  pbPercent.textContent = `${goal.progress_percent}%`;
  pbFill.style.width = `${goal.progress_percent}%`;

  // Circular progress calculations (Radius = 70, Circumference = 440)
  const offset = 440 - (goal.progress_percent / 100) * 440;
  radialBar.style.strokeDashoffset = offset;

  // Motivational logic
  updateMotivation(goal.progress_percent);
  
  // Calculate Target in other currencies based on live rates
  updateTargetConversions(goal.target_amount);
}

// Generate motivational messages
function updateMotivation(percent) {
  let title = "Step 1: Get Started!";
  let desc = "Take the first step, every coin counts towards your future.";
  let icon = "award";

  if (percent === 100) {
    title = "Goal Reached!";
    desc = "Spectacular job! You have achieved your financial target. Time to set new steps!";
    icon = "party-popper";
  } else if (percent >= 75) {
    title = "Almost There!";
    desc = "You are close to your goal! The finish line is in sight, keep pushing!";
    icon = "check-check";
  } else if (percent >= 50) {
    title = "Over Halfway!";
    desc = "Excellent job! You are over halfway there. Your consistency is paying off.";
    icon = "sparkles";
  } else if (percent >= 25) {
    title = "Great Pace!";
    desc = "Keep going! You are building solid saving habits. We are moving steadily.";
    icon = "activity";
  } else if (percent > 0) {
    title = "Awesome Start!";
    desc = "Keep going! The journey of a thousand miles begins with a single step.";
    icon = "trending-up";
  }

  motivationTitle.textContent = title;
  motivationDesc.textContent = desc;
  
  // Refresh motivation icon
  const iconEl = motivationBox.querySelector('.motivation-icon');
  iconEl.setAttribute('data-lucide', icon);
  lucide.createIcons();
}


// --- LIVE FINANCE API INTEGRATION ---

// Fetch rates from ExchangeRate-API
async function fetchExchangeRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error('API fetch failed');
    const data = await res.json();
    
    // Cache rates
    state.rates.TRY = data.rates.TRY;
    state.rates.EUR = data.rates.EUR;
    state.rates.GBP = data.rates.GBP;

    // Render currency rows
    usdTryEl.textContent = `${data.rates.TRY.toFixed(2)} ₺`;
    // We want EUR / USD representation: EUR/USD rate is 1 / EUR value relative to USD
    const eurUsd = (1 / data.rates.EUR).toFixed(4);
    const gbpUsd = (1 / data.rates.GBP).toFixed(4);

    eurUsdEl.textContent = `$${eurUsd}`;
    gbpUsdEl.textContent = `$${gbpUsd}`;

    // Update goals calculations if goal exists
    if (state.goal) {
      updateTargetConversions(state.goal.target_amount);
    }
  } catch (err) {
    console.error('Error fetching financial rates:', err);
    usdTryEl.textContent = 'Service unavailable';
    eurUsdEl.textContent = 'Service unavailable';
    gbpUsdEl.textContent = 'Service unavailable';
  }
}

// Convert target goal currency
function updateTargetConversions(targetAmount) {
  if (!targetAmount) return;

  if (state.rates.EUR) {
    const targetInEur = targetAmount * state.rates.EUR;
    convEurEl.textContent = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(targetInEur);
  } else {
    convEurEl.textContent = '-';
  }

  if (state.rates.TRY) {
    const targetInTry = targetAmount * state.rates.TRY;
    convTryEl.textContent = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(targetInTry);
  } else {
    convTryEl.textContent = '-';
  }
}


// --- DASHBOARD INITIALIZATION ---

async function initDashboard() {
  // Populate form with current goal if user already has one
  try {
    const res = await fetch('/api/goal', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (res.ok && data.goal) {
      state.goal = data.goal;
      
      // Populate inputs
      document.getElementById('target-amount').value = data.goal.target_amount;
      document.getElementById('current-savings').value = data.goal.current_savings;
      document.getElementById('daily-saving').value = data.goal.daily_saving;

      renderGoalMetrics(data.goal);
    } else {
      renderGoalMetrics(null);
    }
  } catch (err) {
    console.error('Error fetching goal details:', err);
  }

  // Sync market rates
  fetchExchangeRates();

  // Initialize Tax Calculator & Chart
  initTaxCalculator();
}

// --- TAX CALCULATOR LOGIC & CHART.JS ---
let taxChartInstance = null;

function initTaxCalculator() {
  const taxIncomeInput = document.getElementById('tax-income');
  const taxRateSlider = document.getElementById('tax-rate-slider');

  if (taxIncomeInput && taxRateSlider) {
    // Prevent duplicated event listeners if called multiple times
    taxIncomeInput.removeEventListener('input', updateTaxCalculator);
    taxRateSlider.removeEventListener('input', updateTaxCalculator);
    
    taxIncomeInput.addEventListener('input', updateTaxCalculator);
    taxRateSlider.addEventListener('input', updateTaxCalculator);
    
    updateTaxCalculator();
  }
}

function updateTaxCalculator() {
  const taxIncomeInput = document.getElementById('tax-income');
  const taxRateSlider = document.getElementById('tax-rate-slider');
  const taxRateDisplay = document.getElementById('tax-rate-display');
  const statGross = document.getElementById('stat-gross');
  const statTaxPct = document.getElementById('stat-tax-pct');
  const statTax = document.getElementById('stat-tax');
  const statNet = document.getElementById('stat-net');
  const ctx = document.getElementById('taxChart');

  if (!taxIncomeInput || !taxRateSlider || !ctx) return;

  const gross = parseFloat(taxIncomeInput.value) || 0;
  const rate = parseFloat(taxRateSlider.value) || 0;

  const deductions = gross * (rate / 100);
  const net = Math.max(0, gross - deductions);

  // Update text values
  taxRateDisplay.textContent = `${rate}%`;
  statTaxPct.textContent = rate;

  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  statGross.textContent = formatter.format(gross);
  statTax.textContent = `-${formatter.format(deductions)}`;
  statNet.textContent = formatter.format(net);

  // Update or Create Chart.js instance
  if (taxChartInstance) {
    taxChartInstance.data.datasets[0].data = [net, deductions];
    taxChartInstance.update();
  } else {
    if (typeof Chart !== 'undefined') {
      taxChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Net Income', 'Taxes'],
          datasets: [{
            data: [net, deductions],
            backgroundColor: ['#10b981', '#f43f5e'],
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#475569',
                font: {
                  family: "'Inter', sans-serif",
                  size: 11,
                  weight: '600'
                },
                padding: 10
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  let label = context.label || '';
                  if (label) {
                    label += ': ';
                  }
                  label += formatter.format(context.raw);
                  return label;
                }
              }
            }
          },
          cutout: '65%'
        }
      });
    }
  }
}

// App bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  if (state.token) {
    fetchMe();
  } else {
    updateView();
  }
  
  // Refresh exchange rates every 5 minutes when active
  setInterval(() => {
    if (state.token) {
      fetchExchangeRates();
    }
  }, 300000);
});

