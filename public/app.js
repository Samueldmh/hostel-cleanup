/* ==========================================================================
   FRONTEND LOGIC - HOSTEL CLEANUP ALLOCATOR
   API Integrations, Real-time Polling, & Premium UI Animations
   ========================================================================== */

// --- App State Variables ---
let currentUser = null;
let appState = {
  tasks: [],
  members: [],
  history: []
};
let activeTaskIdForUpload = null;
let pollingInterval = null;
let countdownTimerInterval = null;

// --- DOM Elements ---
const DOM = {
  // Views
  loginView: document.getElementById('login-view'),
  mainLoginCard: document.getElementById('main-login-card'),
  dashboardView: document.getElementById('dashboard-view'),
  
  // Header
  loggedUserProfile: document.getElementById('logged-user-profile'),
  profileName: document.getElementById('profile-name'),
  logoutBtn: document.getElementById('logout-btn'),
  currentDate: document.getElementById('current-date'),
  
  // Progress Bar
  progressBarContainer: document.getElementById('progress-bar-container'),
  mainProgressBar: document.getElementById('main-progress-bar'),
  progressText: document.getElementById('progress-text'),
  completionText: document.getElementById('completion-text'),
  
  // Login Form
  loginForm: document.getElementById('login-form'),
  regNumberInput: document.getElementById('reg-number'),
  loginSubmitBtn: document.getElementById('login-submit-btn'),
  regInputGroup: document.getElementById('reg-input-group'),
  passwordInputGroup: document.getElementById('password-input-group'),
  regPasswordInput: document.getElementById('reg-password'),
  loginSubmitText: document.getElementById('login-submit-text'),
  loginBackBtn: document.getElementById('login-back-btn'),
  forgotPwdLink: document.getElementById('forgot-pwd-link'),
  
  // Setup Security Form
  setupSecurityCard: document.getElementById('setup-security-card'),
  setupSecurityForm: document.getElementById('setup-security-form'),
  setupPasswordInput: document.getElementById('setup-password'),
  setupConfirmPasswordInput: document.getElementById('setup-confirm-password'),
  setupQuestionSelect: document.getElementById('setup-question'),
  setupAnswerInput: document.getElementById('setup-answer'),
  setupCancelBtn: document.getElementById('setup-cancel-btn'),
  
  // Reset Password Form
  resetPasswordCard: document.getElementById('reset-password-card'),
  resetPasswordForm: document.getElementById('reset-password-form'),
  resetQuestionLabel: document.getElementById('reset-question-label'),
  resetAnswerInput: document.getElementById('reset-answer'),
  resetNewPasswordInput: document.getElementById('reset-new-password'),
  resetCancelBtn: document.getElementById('reset-cancel-btn'),
  
  // Credentials Helper
  helperToggle: document.getElementById('helper-toggle'),
  helperContent: document.getElementById('helper-content'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  panes: document.querySelectorAll('.pane'),
  quickChips: document.querySelectorAll('.quick-chip'),
  
  // Panels & Grids
  locationsGrid: document.getElementById('locations-grid'),
  studentSection: document.getElementById('student-section'),
  adminSection: document.getElementById('admin-section'),
  
  // Student States
  assignmentPending: document.getElementById('assignment-pending'),
  assignmentLoading: document.getElementById('assignment-loading'),
  assignmentSuccess: document.getElementById('assignment-success'),
  assignmentCompleted: document.getElementById('assignment-completed'),
  
  // Pending State
  pendingUserName: document.getElementById('pending-user-name'),
  allocateBtn: document.getElementById('allocate-btn'),
  
  // Loading State (Roulette)
  rouletteScroller: document.getElementById('roulette-scroller'),
  
  // Success State
  assignedLocationTitle: document.getElementById('assigned-location-title'),
  assignedLocationDesc: document.getElementById('assigned-location-desc'),
  assignedLocationImage: document.getElementById('assigned-location-image'),
  completeTaskBtn: document.getElementById('complete-task-btn'),
  
  // Completed State
  completedUserName: document.getElementById('completed-user-name'),
  completedSpotCard: document.getElementById('completed-spot-card'),
  
  // Admin Elements
  statAssignedSlots: document.getElementById('stat-assigned-slots'),
  statCompletedTasks: document.getElementById('stat-completed-tasks'),
  statFreeLocations: document.getElementById('stat-free-locations'),
  adminResetBtn: document.getElementById('admin-reset-btn'),
  adminShareBtn: document.getElementById('admin-share-btn'),
  rosterTableBody: document.getElementById('roster-table-body'),
  auditTrailLogs: document.getElementById('audit-trail-logs'),
  adminFilePicker: document.getElementById('admin-file-picker'),
  
  // Reset Confirmation Modal
  confirmModal: document.getElementById('confirm-modal'),
  cancelResetBtn: document.getElementById('cancel-reset-btn'),
  confirmResetBtn: document.getElementById('confirm-reset-btn'),
  
  // Notifications
  toastNotification: document.getElementById('toast-notification'),
  toastMessage: document.getElementById('toast-message'),

  // Countdown & Schedule Settings (New!)
  countdownContainer: document.getElementById('countdown-container'),
  timerDays: document.getElementById('timer-days'),
  timerHours: document.getElementById('timer-hours'),
  timerMins: document.getElementById('timer-mins'),
  timerSecs: document.getElementById('timer-secs'),
  nextCleanupTargetLbl: document.getElementById('next-cleanup-target-lbl'),
  nextCleanupInput: document.getElementById('next-cleanup-input'),
  bypassTimeToggle: document.getElementById('bypass-time-toggle'),
  saveSettingsBtn: document.getElementById('save-settings-btn')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Set Date header to clean readable format
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  DOM.currentDate.textContent = new Date().toLocaleDateString('en-US', dateOptions);

  // Automatically remove testing credentials helper in live production URL
  // (unless opened locally or explicitly forced via URL param: ?dev=true)
  const urlParams = new URLSearchParams(window.location.search);
  const forceDev = urlParams.get('dev') === 'true' || urlParams.get('test') === 'true';
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocal && !forceDev) {
    const helperWidget = document.querySelector('.credentials-helper');
    if (helperWidget) {
      helperWidget.remove();
    }
  }

  // Initialize UI Bindings
  initEventListeners();
  
  // Check if session exists in sessionStorage
  const savedUser = sessionStorage.getItem('hostel_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    enterDashboard();
  }
});

// --- EVENT LISTENERS ---
function initEventListeners() {
  // 1. Credentials Helper Toggle
  DOM.helperToggle.addEventListener('click', () => {
    DOM.helperToggle.classList.toggle('active');
    DOM.helperContent.classList.toggle('hidden');
  });

  // 2. Helper Tabs switching
  DOM.tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      DOM.tabBtns.forEach(b => b.classList.remove('active'));
      DOM.panes.forEach(p => p.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(`pane-${tabId}`).classList.add('active');
      e.stopPropagation();
    });
  });

  // 3. Quick Credential Chip clicking
  DOM.quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const reg = chip.getAttribute('data-reg');
      DOM.regNumberInput.value = reg;
      showToast('Autofilled! Ready to log in.', 'info');
      // Briefly flash input
      DOM.regNumberInput.style.borderColor = 'var(--cyan)';
      setTimeout(() => DOM.regNumberInput.style.borderColor = 'var(--glass-border)', 1000);
    });
  });

  // 4. Login Submission
  DOM.loginForm.addEventListener('submit', handleLogin);
  
  // Back button in login form
  DOM.loginBackBtn.addEventListener('click', resetLoginFormState);
  
  // Forgot password click
  DOM.forgotPwdLink.addEventListener('click', handleForgotPassword);

  // 4.1 Security Setup Submission
  DOM.setupSecurityForm.addEventListener('submit', handleSecuritySetup);
  DOM.setupCancelBtn.addEventListener('click', cancelSecuritySetup);

  // 4.2 Password Reset Submission
  DOM.resetPasswordForm.addEventListener('submit', handlePasswordReset);
  DOM.resetCancelBtn.addEventListener('click', cancelPasswordReset);

  // 5. Logout Trigger
  DOM.logoutBtn.addEventListener('click', handleLogout);

  // 6. Request Spot Allocation
  DOM.allocateBtn.addEventListener('click', triggerSpotAllocation);

  // 7. Complete Task Trigger
  DOM.completeTaskBtn.addEventListener('click', triggerTaskCompletion);

  // 8. Admin Reset weekly triggers
  DOM.adminResetBtn.addEventListener('click', () => DOM.confirmModal.classList.remove('hidden'));
  DOM.cancelResetBtn.addEventListener('click', () => DOM.confirmModal.classList.add('hidden'));
  DOM.confirmResetBtn.addEventListener('click', triggerWeeklyReset);

  // 9. Admin image upload file listener
  DOM.adminFilePicker.addEventListener('change', handleAdminFileSelected);

  // 10. Copy assignments for WhatsApp share
  DOM.adminShareBtn.addEventListener('click', copyAssignmentsToClipboard);

  // 11. Admin Save settings (New!)
  DOM.saveSettingsBtn.addEventListener('click', saveScheduleSettings);

  // 12. Instant bypass toggle autosave (New!)
  DOM.bypassTimeToggle.addEventListener('change', autoSaveBypassSetting);

  // 13. Password peep/visibility toggles
  const pwdToggles = [
    { btnId: 'toggle-reg-password', inputId: 'reg-password' },
    { btnId: 'toggle-setup-password', inputId: 'setup-password' },
    { btnId: 'toggle-setup-confirm-password', inputId: 'setup-confirm-password' },
    { btnId: 'toggle-reset-new-password', inputId: 'reset-new-password' }
  ];
  pwdToggles.forEach(t => {
    const btn = document.getElementById(t.btnId);
    const input = document.getElementById(t.inputId);
    if (btn && input) {
      btn.addEventListener('click', () => {
        if (input.type === 'password') {
          input.type = 'text';
          btn.classList.remove('fa-eye');
          btn.classList.add('fa-eye-slash');
        } else {
          input.type = 'password';
          btn.classList.remove('fa-eye-slash');
          btn.classList.add('fa-eye');
        }
      });
    }
  });
}

// --- API ACTIONS ---

// Fetch central state from server
async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    if (data.success) {
      appState = data;
      
      // If user is logged in, sync their local user state in case admin reset it
      if (currentUser) {
        const syncedUser = appState.members.find(m => m.reg.toLowerCase() === currentUser.reg.toLowerCase());
        if (syncedUser) {
          currentUser = syncedUser;
          sessionStorage.setItem('hostel_user', JSON.stringify(currentUser));
        }

        // Pre-populate settings panel for Admin
        if (currentUser.isAdmin && appState.settings) {
          if (document.activeElement !== DOM.nextCleanupInput) {
            DOM.nextCleanupInput.value = appState.settings.nextCleanupDate ? appState.settings.nextCleanupDate.substring(0, 19) : "";
          }
          if (document.activeElement !== DOM.bypassTimeToggle) {
            DOM.bypassTimeToggle.checked = !!appState.settings.bypassTimeRestriction;
          }
        }
      }
      
      renderUI();
    }
  } catch (err) {
    console.error('API Error fetching state:', err);
    showToast('Offline: Could not sync with database!', 'error');
  }
}

// Handle login submissions (Two-Stage Verification)
async function handleLogin(e) {
  e.preventDefault();
  const regVal = DOM.regNumberInput.value.trim();
  if (!regVal) return;

  const isPasswordStage = !DOM.passwordInputGroup.classList.contains('hidden');
  DOM.loginSubmitBtn.disabled = true;

  if (!isPasswordStage) {
    // Stage 1: Validate registration number and detect password presence
    DOM.loginSubmitBtn.innerHTML = `<span>Validating Reg No...</span> <i class="fa-solid fa-spinner fa-spin"></i>`;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg: regVal })
      });
      const data = await res.json();

      if (data.success) {
        if (data.requiresSetup) {
          // Account has no password yet - redirect to Setup Card
          DOM.mainLoginCard.classList.add('hidden');
          DOM.setupSecurityCard.classList.remove('hidden');
          // Prefill reg hidden value or state
          DOM.setupSecurityForm.dataset.reg = regVal;
          showToast('First-time login! Set up security parameters.', 'info');
        } else if (data.requiresPassword) {
          // Account has a password - reveal password field
          DOM.regInputGroup.classList.add('hidden');
          DOM.passwordInputGroup.classList.remove('hidden');
          DOM.loginBackBtn.classList.remove('hidden');
          DOM.loginSubmitText.textContent = "Log In";
          DOM.regPasswordInput.focus();
        }
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      console.error('Login validation error:', err);
      showToast('Server connection failed. Try again!', 'error');
    } finally {
      DOM.loginSubmitBtn.disabled = false;
      if (!isPasswordStage && DOM.passwordInputGroup.classList.contains('hidden') && DOM.setupSecurityCard.classList.contains('hidden')) {
        DOM.loginSubmitBtn.innerHTML = `<span>Continue</span> <i class="fa-solid fa-chevron-right"></i>`;
      } else if (!DOM.passwordInputGroup.classList.contains('hidden')) {
        DOM.loginSubmitBtn.innerHTML = `<span>Log In</span> <i class="fa-solid fa-right-to-bracket"></i>`;
      } else {
        DOM.loginSubmitBtn.innerHTML = `<span>Continue</span> <i class="fa-solid fa-chevron-right"></i>`;
      }
    }
  } else {
    // Stage 2: Verify password
    const passwordVal = DOM.regPasswordInput.value;
    if (!passwordVal) {
      DOM.loginSubmitBtn.disabled = false;
      showToast('Password is required!', 'error');
      return;
    }

    DOM.loginSubmitBtn.innerHTML = `<span>Verifying Password...</span> <i class="fa-solid fa-spinner fa-spin"></i>`;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg: regVal, password: passwordVal })
      });
      const data = await res.json();

      if (data.success) {
        currentUser = data.member;
        sessionStorage.setItem('hostel_user', JSON.stringify(currentUser));
        enterDashboard();
        showToast(`Welcome back, ${currentUser.name}!`, 'success');
        resetLoginFormState();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      console.error('Password login error:', err);
      showToast('Login verification failed. Try again!', 'error');
    } finally {
      DOM.loginSubmitBtn.disabled = false;
      DOM.loginSubmitBtn.innerHTML = `<span>Log In</span> <i class="fa-solid fa-right-to-bracket"></i>`;
    }
  }
}

// Reset login form back to Stage 1 (Reg input stage)
function resetLoginFormState() {
  DOM.regInputGroup.classList.remove('hidden');
  DOM.passwordInputGroup.classList.add('hidden');
  DOM.loginBackBtn.classList.add('hidden');
  DOM.loginSubmitText.textContent = "Continue";
  DOM.loginSubmitBtn.innerHTML = `<span>Continue</span> <i class="fa-solid fa-chevron-right"></i>`;
  DOM.regPasswordInput.value = '';
}

// First-time Security Setup Submit Handler
async function handleSecuritySetup(e) {
  e.preventDefault();
  const reg = DOM.setupSecurityForm.dataset.reg;
  const password = DOM.setupPasswordInput.value;
  const confirmPassword = DOM.setupConfirmPasswordInput.value;
  const question = DOM.setupQuestionSelect.value;
  const answer = DOM.setupAnswerInput.value.trim();

  if (!reg || !password || !confirmPassword || !question || !answer) {
    showToast('All fields are required!', 'error');
    return;
  }

  if (password.length < 4) {
    showToast('Password must be at least 4 characters long!', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Passwords do not match!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/setup-security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reg: reg,
        password: password,
        securityQuestion: question,
        securityAnswer: answer
      })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = data.member;
      sessionStorage.setItem('hostel_user', JSON.stringify(currentUser));
      
      // Clean form inputs
      DOM.setupPasswordInput.value = '';
      DOM.setupConfirmPasswordInput.value = '';
      DOM.setupQuestionSelect.value = '';
      DOM.setupAnswerInput.value = '';
      
      // Transition to dashboard
      DOM.setupSecurityCard.classList.add('hidden');
      enterDashboard();
      showToast('Security configuration completed successfully!', 'success');
      resetLoginFormState();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Security setup error:', err);
    showToast('Failed to save security parameters. Try again!', 'error');
  }
}

// Cancel Security Setup
function cancelSecuritySetup() {
  DOM.setupSecurityCard.classList.add('hidden');
  DOM.mainLoginCard.classList.remove('hidden');
  resetLoginFormState();
}

// Handle Forgot Password link click
async function handleForgotPassword(e) {
  e.preventDefault();
  const regVal = DOM.regNumberInput.value.trim();
  if (!regVal) {
    showToast('Please enter your registration number first!', 'info');
    DOM.regNumberInput.focus();
    return;
  }

  try {
    const res = await fetch('/api/get-security-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reg: regVal })
    });
    const data = await res.json();

    if (data.success) {
      DOM.mainLoginCard.classList.add('hidden');
      DOM.resetPasswordCard.classList.remove('hidden');
      DOM.resetQuestionLabel.innerHTML = `<i class="fa-solid fa-circle-question" style="color: #c084fc;"></i> ${data.question}`;
      DOM.resetPasswordForm.dataset.reg = regVal;
      DOM.resetAnswerInput.focus();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Fetch security question error:', err);
    showToast('Error retrieving security question. Try again!', 'error');
  }
}

// Handle password reset using security question
async function handlePasswordReset(e) {
  e.preventDefault();
  const reg = DOM.resetPasswordForm.dataset.reg;
  const answer = DOM.resetAnswerInput.value.trim();
  const newPassword = DOM.resetNewPasswordInput.value;

  if (!reg || !answer || !newPassword) {
    showToast('All fields are required!', 'error');
    return;
  }

  if (newPassword.length < 4) {
    showToast('Password must be at least 4 characters long!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reg: reg,
        securityAnswer: answer,
        newPassword: newPassword
      })
    });
    const data = await res.json();

    if (data.success) {
      currentUser = data.member;
      sessionStorage.setItem('hostel_user', JSON.stringify(currentUser));
      
      // Clean inputs
      DOM.resetAnswerInput.value = '';
      DOM.resetNewPasswordInput.value = '';
      
      // Transition
      DOM.resetPasswordCard.classList.add('hidden');
      enterDashboard();
      showToast('Password reset successful! Welcome to the sweep.', 'success');
      resetLoginFormState();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Password reset error:', err);
    showToast('Failed to reset password. Try again!', 'error');
  }
}

// Cancel Password Reset
function cancelPasswordReset() {
  DOM.resetPasswordCard.classList.add('hidden');
  DOM.mainLoginCard.classList.remove('hidden');
  resetLoginFormState();
}

// Trigger spot allocation for logged-in user
async function triggerSpotAllocation() {
  if (!currentUser || currentUser.isAdmin) return;

  // 1. Enter UI roulette animation loading view
  DOM.assignmentPending.classList.add('hidden');
  DOM.assignmentLoading.classList.remove('hidden');

  // Seed scroller with items for the scrolling illusion
  setupRouletteScroller();

  try {
    // Fire API call concurrently with the animation
    const apiPromise = fetch('/api/allocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reg: currentUser.reg })
    });

    const res = await apiPromise;
    const data = await res.json();

    if (data.success) {
      const assignedTask = data.task;
      
      // Perform the scrolling animation transition
      runRouletteAnimation(assignedTask, () => {
        // Callback after animation lands
        currentUser.assignedLocationId = assignedTask.id;
        sessionStorage.setItem('hostel_user', JSON.stringify(currentUser));
        
        showToast(`Congratulations! You were assigned: "${assignedTask.name}"`, 'success');
        triggerConfettiEffect();
        
        // Refresh entire state
        fetchState();
      });
    } else {
      DOM.assignmentLoading.classList.add('hidden');
      DOM.assignmentPending.classList.remove('hidden');
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Allocation error:', err);
    DOM.assignmentLoading.classList.add('hidden');
    DOM.assignmentPending.classList.remove('hidden');
    showToast('Connection error during random allocation!', 'error');
  }
}

// Mark assigned task complete
async function triggerTaskCompletion() {
  if (!currentUser || !currentUser.assignedLocationId) return;

  DOM.completeTaskBtn.disabled = true;
  DOM.completeTaskBtn.innerHTML = `<span>Submitting Status...</span> <i class="fa-solid fa-spinner fa-spin"></i>`;

  try {
    const res = await fetch('/api/complete-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reg: currentUser.reg, taskId: currentUser.assignedLocationId })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Cleanup duty completed! Roster updated.', 'success');
      triggerConfettiEffect();
      fetchState();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Task complete error:', err);
    showToast('Failed to contact database to log completion!', 'error');
  } finally {
    DOM.completeTaskBtn.disabled = false;
    DOM.completeTaskBtn.innerHTML = `<span>Mark Task As Completed</span> <i class="fa-solid fa-circle-check"></i>`;
  }
}

// Admin: Reset entire weekly board
async function triggerWeeklyReset() {
  if (!currentUser || !currentUser.isAdmin) return;

  DOM.confirmModal.classList.add('hidden');
  showToast('Resetting cleanup assignments...', 'info');

  try {
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminReg: currentUser.reg })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Database wiped successfully! Ready for a new week.', 'success');
      fetchState();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Reset error:', err);
    showToast('Failed to contact server to reset roster!', 'error');
  }
}

// Admin: Mark student task complete
async function adminMarkComplete(studentReg) {
  if (!currentUser || !currentUser.isAdmin) return;

  const btn = document.querySelector(`.btn-table-action[data-reg="${studentReg}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
  }

  try {
    const res = await fetch('/api/complete-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminReg: currentUser.reg, studentReg: studentReg })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message, 'success');
      triggerConfettiEffect();
      fetchState();
    } else {
      showToast(data.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-square-check"></i> Complete`;
      }
    }
  } catch (err) {
    console.error('Task complete error:', err);
    showToast('Failed to contact database to log completion!', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-square-check"></i> Complete`;
    }
  }
}

// Make it explicitly global for inline onclick
window.adminMarkComplete = adminMarkComplete;

// Admin: Handle file selection & trigger Canvas compression
function triggerAdminPhotoUpload(taskId) {
  if (!currentUser || !currentUser.isAdmin) return;
  activeTaskIdForUpload = taskId;
  DOM.adminFilePicker.click();
}

function handleAdminFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file!', 'error');
    return;
  }

  showToast('Processing & compressing photo...', 'info');

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      // 1. Canvas compression setup to limit size under 50KB for db.json performance
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 350;
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG with 0.6 quality (highly compact, looks great)
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
      
      // Post to database
      uploadCompressedImage(compressedBase64);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  
  // Reset input value so same file can be uploaded again
  DOM.adminFilePicker.value = '';
}

async function uploadCompressedImage(base64Image) {
  if (!currentUser || !currentUser.isAdmin || !activeTaskIdForUpload) return;

  try {
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminReg: currentUser.reg,
        taskId: activeTaskIdForUpload,
        image: base64Image
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Location picture updated successfully on all devices!', 'success');
      fetchState();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Image upload error:', err);
    showToast('Failed to save photo in central database!', 'error');
  } finally {
    activeTaskIdForUpload = null;
  }
}

// --- ROULETTE SCROLLER ANIMATION EFFECT ---

function setupRouletteScroller() {
  DOM.rouletteScroller.innerHTML = '';
  DOM.rouletteScroller.style.transition = 'none';
  DOM.rouletteScroller.style.transform = 'translateY(0)';

  // Build temporary items list
  // Include pre-seeded names dynamically for visual fun
  const candidates = appState.tasks.length > 0 
    ? appState.tasks.map(t => t.name) 
    : ["Staircase", "Boys Corridor", "Balcony", "Gutter", "Outside Fence", "Dust bins", "Backyard"];
  
  // Shuffle list briefly
  const items = [];
  for (let i = 0; i < 25; i++) {
    const idx = Math.floor(Math.random() * candidates.length);
    items.push(candidates[idx]);
  }
  
  // Render roulette list
  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = `roulette-item ${index === 23 ? 'active' : ''}`;
    div.textContent = item;
    DOM.rouletteScroller.appendChild(div);
  });
}

function runRouletteAnimation(targetTask, callback) {
  // Replace the index 23 item with the actual assigned task so it lands perfectly on it!
  const items = DOM.rouletteScroller.querySelectorAll('.roulette-item');
  if (items[23]) {
    items[23].textContent = targetTask.name;
    items[23].classList.add('active');
  }

  // Force reflow
  DOM.rouletteScroller.getBoundingClientRect();

  // Scroll down smoothly
  // Since each item is 60px tall, scrolling to 23rd item is 23 * 60px = 1380px
  DOM.rouletteScroller.style.transition = 'transform 2.2s cubic-bezier(0.1, 0.85, 0.25, 1)';
  DOM.rouletteScroller.style.transform = `translateY(-1380px)`;

  // Trigger callback after scroller stops
  setTimeout(() => {
    callback();
  }, 2200);
}

// --- RENDERING UI VIEWS ---

function renderUI() {
  if (!currentUser) return;

  // --- 1. Header Profile Badge ---
  DOM.loggedUserProfile.classList.remove('hidden');
  DOM.profileName.textContent = currentUser.name + (currentUser.isAdmin ? ' (Admin)' : '');

  // --- 2. Progress Statistics ---
  const totalSlots = 19;
  let assignedCount = 0;
  let completedCount = 0;

  appState.tasks.forEach(t => {
    assignedCount += t.assignedTo.length;
    completedCount += t.completedBy.length;
  });

  const percentAssigned = Math.min(100, Math.round((assignedCount / totalSlots) * 100));
  DOM.mainProgressBar.style.width = `${percentAssigned}%`;
  DOM.progressText.textContent = `${assignedCount} / ${totalSlots} slots allocated`;
  DOM.completionText.textContent = `${completedCount} completed`;

  // --- 3. Locations Grid rendering ---
  DOM.locationsGrid.innerHTML = '';
  
  appState.tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'location-card glass';
    card.id = `card-${task.id}`;

    // Gender indicator label
    let genderLabel = '<span class="rule-badge"><i class="fa-solid fa-people-arrows"></i> General</span>';
    if (task.genderRestriction === 'male') {
      genderLabel = '<span class="rule-badge boys-only"><i class="fa-solid fa-mars"></i> Boys Only</span>';
    }

    // Occupancy Status label
    const isFull = task.assignedTo.length >= task.capacity;
    let statusLabel = `<span class="status-badge free"><i class="fa-solid fa-circle"></i> Free</span>`;
    if (isFull) {
      statusLabel = `<span class="status-badge assigned"><i class="fa-solid fa-lock"></i> Full</span>`;
    } else if (task.assignedTo.length > 0) {
      statusLabel = `<span class="status-badge assigned" style="background:rgba(6,182,212,0.8)"><i class="fa-solid fa-users"></i> Partial</span>`;
    }

    // Occupancy Bubble Slots Renderer
    let slotsHTML = '';
    for (let i = 0; i < task.capacity; i++) {
      const assignee = task.assignedTo[i];
      if (assignee) {
        const isTaskDone = task.completedBy && task.completedBy.includes(assignee.reg);
        slotsHTML += `
          <div class="slot-row">
            <span class="slot-dot occupied"></span>
            <span class="slot-name occupied">
              <i class="fa-solid fa-user-circle text-dim"></i> ${assignee.name}
              ${isTaskDone ? '<i class="fa-solid fa-circle-check complete-check-icon" title="Completed"></i>' : ''}
            </span>
          </div>
        `;
      } else {
        slotsHTML += `
          <div class="slot-row">
            <span class="slot-dot free"></span>
            <span class="slot-name free">Empty Spot</span>
          </div>
        `;
      }
    }

    // Combine Card HTML
    card.innerHTML = `
      <div class="card-img-wrapper">
        <img src="${task.image}" alt="${task.name}">
        <div class="card-badges">
          ${statusLabel}
          ${genderLabel}
        </div>
        ${currentUser.isAdmin ? `
          <div class="admin-img-overlay" onclick="triggerAdminPhotoUpload('${task.id}')">
            <i class="fa-solid fa-camera"></i>
            <span>Upload Photo</span>
          </div>
        ` : ''}
      </div>
      <div class="card-content">
        <div class="card-title-group">
          <h4>${task.name}</h4>
          <p>${task.desc}</p>
        </div>
        <div class="card-slots">
          <span class="slots-title">Allocated Occupants (${task.assignedTo.length}/${task.capacity})</span>
          <div class="slots-grid">
            ${slotsHTML}
          </div>
        </div>
      </div>
    `;

    DOM.locationsGrid.appendChild(card);
  });

  // --- 4. Sidebar Content Branching ---
  if (currentUser.isAdmin) {
    renderAdminSection();
  } else {
    renderStudentSection();
  }
}

// Student View Rendering
function renderStudentSection() {
  DOM.adminSection.classList.add('hidden');
  DOM.studentSection.classList.remove('hidden');

  const myTask = appState.tasks.find(t => t.assignedTo.some(u => u.reg === currentUser.reg));
  
  if (!myTask) {
    // CASE 1: UNASSIGNED
    DOM.pendingUserName.textContent = currentUser.name;
    DOM.assignmentPending.classList.remove('hidden');
    DOM.assignmentLoading.classList.add('hidden');
    DOM.assignmentSuccess.classList.add('hidden');
    DOM.assignmentCompleted.classList.add('hidden');

    // Time-restriction check (New!)
    const settings = appState.settings || {};
    const bypass = !!settings.bypassTimeRestriction;
    const targetDateStr = settings.nextCleanupDate || "2026-06-13T07:00:00";
    const isLocked = !bypass && (new Date() < new Date(targetDateStr));

    if (isLocked) {
      DOM.countdownContainer.classList.remove('hidden');
      DOM.allocateBtn.classList.add('hidden');
      startCountdown(targetDateStr);
    } else {
      DOM.countdownContainer.classList.add('hidden');
      DOM.allocateBtn.classList.remove('hidden');
      if (countdownTimerInterval) {
        clearInterval(countdownTimerInterval);
        countdownTimerInterval = null;
      }
    }
  } else {
    // Check if I marked my task complete
    const isICompleted = myTask.completedBy && myTask.completedBy.includes(currentUser.reg);
    
    if (isICompleted) {
      // CASE 3: EXTREME SUCCESS / TASK DONE
      DOM.completedUserName.textContent = currentUser.name;
      DOM.completedSpotCard.innerHTML = `
        <img src="${myTask.image}" alt="${myTask.name}">
        <div>
          <h5>${myTask.name}</h5>
          <p>${myTask.desc}</p>
        </div>
      `;
      DOM.assignmentPending.classList.add('hidden');
      DOM.assignmentLoading.classList.add('hidden');
      DOM.assignmentSuccess.classList.add('hidden');
      DOM.assignmentCompleted.classList.remove('hidden');
    } else {
      // CASE 2: ASSIGNED (BUT NOT YET COMPLETED)
      DOM.assignedLocationTitle.textContent = myTask.name;
      DOM.assignedLocationDesc.textContent = myTask.desc;
      DOM.assignedLocationImage.innerHTML = `<img src="${myTask.image}" alt="${myTask.name}">`;

      DOM.assignmentPending.classList.add('hidden');
      DOM.assignmentLoading.classList.add('hidden');
      DOM.assignmentSuccess.classList.remove('hidden');
      DOM.assignmentCompleted.classList.add('hidden');
    }
  }
}

// Admin View Rendering
function renderAdminSection() {
  DOM.studentSection.classList.add('hidden');
  DOM.adminSection.classList.remove('hidden');

  // A. Calculations
  const totalSlots = 19;
  let assignedCount = 0;
  let completedCount = 0;

  appState.tasks.forEach(t => {
    assignedCount += t.assignedTo.length;
    completedCount += t.completedBy.length;
  });

  DOM.statAssignedSlots.textContent = `${assignedCount}/${totalSlots}`;
  DOM.statCompletedTasks.textContent = `${completedCount}/${totalSlots}`;
  DOM.statFreeLocations.textContent = appState.tasks.filter(t => t.assignedTo.length < t.capacity).length;

  // B. Roster Table Populate
  DOM.rosterTableBody.innerHTML = '';
  // Sort members: workers first, admin last
  const displayMembers = [...appState.members].filter(m => !m.isAdmin);

  displayMembers.forEach(member => {
    const task = member.assignedLocationId ? appState.tasks.find(t => t.id === member.assignedLocationId) : null;
    
    let locationText = '<span style="color:var(--text-dim);font-style:italic">Unallocated</span>';
    let statusPill = `<span class="status-pill free">Waiting</span>`;
    
    if (task) {
      locationText = `<strong>${task.name}</strong>`;
      const isDone = task.completedBy && task.completedBy.includes(member.reg);
      if (isDone) {
        statusPill = `<span class="status-pill done"><i class="fa-solid fa-check"></i> Complete</span>`;
      } else {
        statusPill = `
          <button class="btn-table-action" data-reg="${member.reg}" onclick="adminMarkComplete('${member.reg}')">
            <i class="fa-solid fa-square-check"></i> Complete
          </button>
        `;
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${member.name}</td>
      <td style="text-transform:capitalize">${member.gender}</td>
      <td>${locationText}</td>
      <td>${statusPill}</td>
    `;
    DOM.rosterTableBody.appendChild(tr);
  });

  // C. Audit Trail Logs Populate
  DOM.auditTrailLogs.innerHTML = '';
  if (appState.history && appState.history.length > 0) {
    appState.history.forEach(log => {
      const div = document.createElement('div');
      div.className = 'log-item';
      div.innerHTML = `
        <span class="log-time">[${log.timestamp}]</span>
        <span class="log-msg">${log.message}</span>
      `;
      DOM.auditTrailLogs.appendChild(div);
    });
  } else {
    DOM.auditTrailLogs.innerHTML = `<p class="no-logs">No activity recorded yet for this session.</p>`;
  }
}

// --- GLOBAL UTILITY FUNCS ---

// Access transitions between Login and Dashboard
function enterDashboard() {
  DOM.loginView.classList.add('hidden');
  DOM.dashboardView.classList.remove('hidden');
  DOM.progressBarContainer.classList.remove('hidden');
  
  // Start dynamic polling synchronization
  fetchState();
  pollingInterval = setInterval(fetchState, 5000);
}

function handleLogout() {
  sessionStorage.removeItem('hostel_user');
  currentUser = null;
  
  // Stop synchronization
  clearInterval(pollingInterval);
  pollingInterval = null;

  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  DOM.loggedUserProfile.classList.add('hidden');
  DOM.progressBarContainer.classList.add('hidden');
  DOM.dashboardView.classList.add('hidden');
  DOM.loginView.classList.remove('hidden');
  showToast('Logged out successfully. See you next Saturday!', 'info');
}

// Render dynamic custom alerts/toasts
function showToast(message, type = 'info') {
  DOM.toastMessage.textContent = message;
  DOM.toastNotification.classList.remove('hidden');
  
  // Style according to type
  DOM.toastNotification.style.borderLeftColor = 
    type === 'success' ? 'var(--emerald)' : 
    type === 'error' ? 'var(--rose)' : 'var(--cyan)';
  
  DOM.toastNotification.querySelector('i').className = 
    type === 'success' ? 'fa-solid fa-circle-check text-emerald' : 
    type === 'error' ? 'fa-solid fa-triangle-exclamation text-rose' : 'fa-solid fa-circle-info';

  // Force animate re-trigger
  DOM.toastNotification.style.animation = 'none';
  DOM.toastNotification.offsetHeight; /* trigger reflow */
  DOM.toastNotification.style.animation = null;

  // Clear timeout to prevent overlaps
  if (DOM.toastNotification.timeoutId) {
    clearTimeout(DOM.toastNotification.timeoutId);
  }

  DOM.toastNotification.timeoutId = setTimeout(() => {
    DOM.toastNotification.classList.add('hidden');
  }, 4500);
}

// Dynamic Confetti Particle Burst
function triggerConfettiEffect() {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#c5a880', '#5d7c5d', '#a35c5c', '#c2995b', '#9eaab7'];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 15,
      vy: (Math.random() - 0.8) * 18 - 4,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      decay: Math.random() * 0.015 + 0.01
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    particles.forEach(p => {
      if (p.alpha > 0) {
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.alpha -= p.decay;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    if (alive) {
      requestAnimationFrame(animate);
    } else {
      document.body.removeChild(canvas);
    }
  }

  animate();
}

// Copy roster to clipboard to easily share via WhatsApp
function copyAssignmentsToClipboard() {
  if (!appState.tasks || appState.tasks.length === 0) return;

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  let text = `🧹 *THE SATURDAY SWEEP ROSTER* 🧹\n📅 *Date:* ${dateStr}\n=============================\n\n`;

  appState.tasks.forEach((task, index) => {
    const assignees = task.assignedTo.map(u => u.name).join(', ');
    const slotDetails = assignees ? `👉 *${assignees}*` : '_Free/No allocations_';
    text += `${index + 1}. *${task.name}* (${task.desc})\n   ${slotDetails}\n\n`;
  });

  text += `=============================\n🔒 *The Saturday Sweep - Fair Roster Sync*\n🔗 Log in to see spot photos and mark completion!`;

  // Copy utilizing modern clipboard API
  navigator.clipboard.writeText(text).then(() => {
    showToast('Roster copied in WhatsApp markup! Paste in your group chat.', 'success');
  }).catch(err => {
    console.error('Clipboard copy failed:', err);
    showToast('Failed to copy to clipboard automatically!', 'error');
  });
}

// Dynamic ticking countdown timer (New!)
function startCountdown(targetDateStr) {
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
  }

  const targetDate = new Date(targetDateStr);
  
  function updateClock() {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      // Unlocked!
      clearInterval(countdownTimerInterval);
      countdownTimerInterval = null;
      DOM.countdownContainer.classList.add('hidden');
      DOM.allocateBtn.classList.remove('hidden');
      return;
    }

    // Calculations
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    // Render numbers
    DOM.timerDays.textContent = String(days).padStart(2, '0');
    DOM.timerHours.textContent = String(hours).padStart(2, '0');
    DOM.timerMins.textContent = String(mins).padStart(2, '0');
    DOM.timerSecs.textContent = String(secs).padStart(2, '0');
    
    // Formatted label
    const dateOptions = { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    DOM.nextCleanupTargetLbl.textContent = targetDate.toLocaleDateString('en-US', dateOptions);
  }

  updateClock();
  countdownTimerInterval = setInterval(updateClock, 1000);
}

// Admin: Save cleanup schedule settings (New!)
async function saveScheduleSettings() {
  if (!currentUser || !currentUser.isAdmin) return;

  const nextCleanupDate = DOM.nextCleanupInput.value;
  const bypassTimeRestriction = DOM.bypassTimeToggle.checked;

  if (!nextCleanupDate) {
    showToast('Please select a valid cleanup date and time!', 'error');
    return;
  }

  DOM.saveSettingsBtn.disabled = true;
  DOM.saveSettingsBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving Settings...</span>`;

  try {
    const res = await fetch('/api/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminReg: currentUser.reg,
        bypassTimeRestriction: bypassTimeRestriction,
        nextCleanupDate: nextCleanupDate
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Cleanup schedule updated successfully!', 'success');
      appState.settings = data.settings;
      fetchState();
    } else {
      showToast(data.message, 'error');
    }
  } catch (err) {
    console.error('Settings update error:', err);
    showToast('Connection error: failed to update schedule!', 'error');
  } finally {
    DOM.saveSettingsBtn.disabled = false;
    DOM.saveSettingsBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Save Roster Schedule</span>`;
  }
}

// Admin: Autosave bypass setting immediately on toggle (New!)
async function autoSaveBypassSetting() {
  if (!currentUser || !currentUser.isAdmin) return;

  const bypassTimeRestriction = DOM.bypassTimeToggle.checked;

  try {
    const res = await fetch('/api/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminReg: currentUser.reg,
        bypassTimeRestriction: bypassTimeRestriction
      })
    });
    const data = await res.json();

    if (data.success) {
      const modeText = bypassTimeRestriction ? "enabled (allocations unlocked)" : "disabled (countdown lock active)";
      showToast(`Bypass successfully ${modeText}!`, 'success');
      appState.settings = data.settings;
      fetchState();
    } else {
      showToast(data.message, 'error');
      // Revert checkbox state
      DOM.bypassTimeToggle.checked = !bypassTimeRestriction;
    }
  } catch (err) {
    console.error('Bypass autosave error:', err);
    showToast('Failed to auto-save bypass override!', 'error');
    DOM.bypassTimeToggle.checked = !bypassTimeRestriction;
  }
}
