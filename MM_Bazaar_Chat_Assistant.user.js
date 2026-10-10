// ==UserScript==
// @name         MM Bazaar Chat Assistant
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-alpha.1
// @description  Manual-send Trade Chat reminder for Manic’s Madhouse Bazaar.
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-bazaar-chat-assistant/MM_Bazaar_Chat_Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-bazaar-chat-assistant/MM_Bazaar_Chat_Assistant.user.js
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js?v=8.0.0-alpha.13
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  const APP_ID = 'mm-bazaar-chat-assistant';
  const MODULE_ID = 'bazaar-reminder';
  const PANEL_KEY = 'bazaar-reminder';
  const STATE_KEY = 'mmBazaarChatAssistantStateV1';
  const PANEL_POSITION_KEY = 'mm_torn_panel_position_v1:' + PANEL_KEY;
  const TRADE_LIMIT = 125;
  const TICK_MS = 1000;
  const BAZAAR_URL = 'https://www.torn.com/bazaar.php?userId=4325346';
  const core = globalThis.MMTornCore;

  const MODES = Object.freeze({
    busy: Object.freeze({ label: 'Busy 5–8 min', min: 5, max: 8 }),
    normal: Object.freeze({ label: 'Normal 8–12 min', min: 8, max: 12 }),
    quiet: Object.freeze({ label: 'Quiet 15–20 min', min: 15, max: 20 }),
  });

  // Original owner copy:
  // MANIC’S MADHOUSE BAZAAR 🏪
  //
  // 🎪 Deals, steals & bargains!
  // 🛒 Stock updated daily — check back regularly for new goodies and deals! 👀
  // 💰 You never know what bargains you might find!
  //
  // Torn Trade Chat is capped at 125 characters. The post below preserves the
  // campaign identity and core claims while adding the shareable Bazaar link.
  const BAZAAR_MESSAGE =
    '🏪 MANIC’S MADHOUSE BAZAAR | 🎪 Deals, steals & bargains! 🛒 Daily stock. 💰 Shop: ' + BAZAAR_URL;

  const OTHER_MM_PANELS = Object.freeze([
    'mm-acquisitions',
    'mm-bazaar-manager',
    'mm-customers',
    'mm-faction-armory',
    'mm-inventory-roi',
    'mm-market-scout',
    'mm-trade-chat-assistant',
  ]);

  let state = loadState();
  let panel = null;
  let lastComposer = null;
  let sessionId = 0;
  let sessionFilled = false;
  let submitArmed = false;

  function loadState() {
    const saved = GM_getValue(STATE_KEY, null);
    const src = saved && typeof saved === 'object' ? saved : {};
    return {
      enabled: src.enabled !== false,
      mode: MODES[src.mode] ? src.mode : 'normal',
      nextAt: Number.isFinite(src.nextAt) ? src.nextAt : 0,
      lastSentAt: Number.isFinite(src.lastSentAt) ? src.lastSentAt : 0,
      completedCount: Number.isFinite(src.completedCount) ? src.completedCount : 0,
      lastCompletedAt: Number.isFinite(src.lastCompletedAt) ? src.lastCompletedAt : 0,
    };
  }

  function saveState() {
    GM_setValue(STATE_KEY, {
      enabled: state.enabled,
      mode: state.mode,
      nextAt: state.nextAt,
      lastSentAt: state.lastSentAt,
      completedCount: state.completedCount,
      lastCompletedAt: state.lastCompletedAt,
    });
  }

  function codePointLength(value) {
    return Array.from(String(value)).length;
  }

  function randomDelayMs() {
    const mode = MODES[state.mode] || MODES.normal;
    const minutes = mode.min + Math.random() * (mode.max - mode.min);
    return Math.round(minutes * 60000);
  }

  function scheduleNext(base) {
    state.nextAt = (base || Date.now()) + randomDelayMs();
    saveState();
  }

  function isPostingDue() {
    return !state.nextAt || Date.now() >= state.nextAt;
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4;
  }

  function buttonText(el) {
    return [
      el && el.getAttribute && el.getAttribute('aria-label'),
      el && el.getAttribute && el.getAttribute('title'),
      el && el.getAttribute && el.getAttribute('data-title'),
      el && el.innerText,
      el && el.textContent,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function elementSignature(el) {
    if (!(el instanceof HTMLElement)) return '';
    const className = typeof el.className === 'string' ? el.className : '';
    return [
      el.id,
      className,
      el.getAttribute('data-channel'),
      el.getAttribute('data-chat'),
      el.getAttribute('data-room'),
      el.getAttribute('aria-label'),
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isTradeChatRoot(root) {
    if (!(root instanceof HTMLElement)) return false;

    const signature = elementSignature(root);
    if (/(^|[\s_-])trade(?:[\s_-]|$)/.test(signature)) return true;

    const chatLike = /chat[-_]?box|chatbox/.test(signature) || /^public_/i.test(root.id || '');
    if (!chatLike) return false;

    const title = root.querySelector(
      '[class*="chat-box-title"],[class*="chatBoxTitle"],[class*="title"],[class*="header"]'
    );
    const label = buttonText(title);
    return label === 'trade' || /^trade\b/.test(label);
  }

  function findTradeOpenControl() {
    const chatRoot = document.getElementById('chatRoot');
    const scope = chatRoot || document;
    const controls = Array.from(scope.querySelectorAll('button,[role="button"]')).filter(isVisible);

    return controls.find((el) => {
      if (el.closest && el.closest('#' + APP_ID)) return false;
      const label = buttonText(el);
      return label === 'trade' || /^trade\b/.test(label);
    }) || null;
  }

  function findTradeRoot() {
    const exact = document.getElementById('public_trade');
    if (exact instanceof HTMLElement && isVisible(exact)) return exact;

    const chatRoot = document.getElementById('chatRoot');
    const scope = chatRoot || document;
    const roots = Array.from(scope.querySelectorAll(
      '[id^="public_"],[data-channel],[data-chat],[data-room],[class*="chatBox"],[class*="chat-box"],[class*="chat_box"]'
    ));

    return roots.find((root) => isVisible(root) && isTradeChatRoot(root)) || null;
  }

  function findTradeComposer() {
    const root = findTradeRoot();
    if (root) {
      const textarea = Array.from(root.querySelectorAll('textarea')).find(isVisible);
      if (textarea instanceof HTMLTextAreaElement) return textarea;
    }

    const chatRoot = document.getElementById('chatRoot');
    if (!chatRoot) return null;

    const textareas = Array.from(chatRoot.querySelectorAll('textarea')).filter(isVisible);
    return textareas.find((textarea) => {
      let node = textarea.parentElement;
      while (node && node !== chatRoot) {
        if (isTradeChatRoot(node)) return true;
        node = node.parentElement;
      }
      return false;
    }) || null;
  }

  function waitForTradeComposer(timeoutMs) {
    const timeout = Number(timeoutMs) || 5000;
    return new Promise((resolve) => {
      const started = Date.now();
      const poll = () => {
        const composer = findTradeComposer();
        if (composer) {
          resolve(composer);
          return;
        }
        if (Date.now() - started >= timeout) {
          resolve(null);
          return;
        }
        setTimeout(poll, 80);
      };
      poll();
    });
  }

  async function ensureTradeOpen() {
    const existing = findTradeComposer();
    if (existing) return existing;

    const control = findTradeOpenControl();
    if (!control) return null;

    control.click();
    return waitForTradeComposer(5000);
  }

  function findTradeMinimizeControl() {
    const root = findTradeRoot();
    if (!root) return null;

    const localButtons = Array.from(root.querySelectorAll('button,[role="button"]')).filter(isVisible);
    const explicit = localButtons.find((el) => /minimi[sz]e|collapse/.test(buttonText(el)));
    if (explicit) return explicit;

    return localButtons.find((el) => {
      const rect = el.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      return rect.top <= rootRect.top + 42 && rect.right >= rootRect.right - 52;
    }) || null;
  }

  function minimizeTradeChat() {
    const control = findTradeMinimizeControl();
    if (control) control.click();
  }

  function insertTradeMessage(textarea, message) {
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    textarea.focus({ preventScroll: true });
    textarea.setRangeText(message, 0, textarea.value.length, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    return textarea.value === message;
  }

  function fillCurrentSession() {
    if (!state.enabled) return { ok: false, reason: 'Assistant disabled.' };
    if (sessionFilled) return { ok: false, reason: 'This Bazaar posting session has already been filled once.' };
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      return { ok: false, reason: 'Return to the focused Torn tab first.' };
    }

    const composer = findTradeComposer();
    if (!composer) return { ok: false, reason: 'Trade Chat is not open.' };
    if (composer.value.trim()) return { ok: false, reason: 'Trade composer already contains text.' };
    if (codePointLength(BAZAAR_MESSAGE) > TRADE_LIMIT) {
      return { ok: false, reason: 'Bazaar post exceeds Torn’s 125-character Trade Chat limit.' };
    }

    if (!insertTradeMessage(composer, BAZAAR_MESSAGE)) {
      return { ok: false, reason: 'Torn rejected the Bazaar composer insertion.' };
    }

    lastComposer = composer;
    sessionFilled = true;
    submitArmed = false;
    render();
    return { ok: true };
  }

  async function preparePostingSession(openedSessionId) {
    if (!state.enabled || openedSessionId !== sessionId || sessionFilled) return;
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      setNote('Return to the focused Torn tab first.', false);
      return;
    }

    const composer = await ensureTradeOpen();
    if (openedSessionId !== sessionId || sessionFilled) return;

    if (!composer) {
      setNote('Trade Chat could not be opened. Open it manually, then press Fill Bazaar.', false);
      return;
    }

    if (!isPostingDue()) {
      setNote('Bazaar timer is still running. Press Fill Bazaar to paste manually.', false);
      return;
    }

    const result = fillCurrentSession();
    setNote(
      result.ok ? 'Bazaar message is ready. Review it, then send manually.' : result.reason,
      result.ok
    );
  }

  function completeAssistedPost() {
    const now = Date.now();
    if (now - state.lastSentAt < 3000) return;

    state.lastSentAt = now;
    state.lastCompletedAt = now;
    state.completedCount += 1;
    scheduleNext(now);

    lastComposer = null;
    sessionFilled = true;
    submitArmed = false;

    render();
    closePanel();
    setTimeout(minimizeTradeChat, 120);
  }

  function handleComposerKeydown(event) {
    if (!sessionFilled || !lastComposer || event.target !== lastComposer) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      submitArmed = true;
    }
  }

  function handleTradeClick(event) {
    if (!sessionFilled || !lastComposer) return;
    const root = findTradeRoot();
    const button = event.target && event.target.closest && event.target.closest('button,[role="button"]');
    if (!root || !button || !root.contains(button)) return;
    if (button.closest && button.closest('#' + APP_ID)) return;
    submitArmed = true;
  }

  function handleComposerInput(event) {
    if (!sessionFilled || !submitArmed || !lastComposer || event.target !== lastComposer) return;
    if (lastComposer.value.trim()) return;

    const completedComposer = lastComposer;
    setTimeout(() => {
      if (completedComposer.value.trim()) return;
      completeAssistedPost();
    }, 150);
  }

  function formatCountdown() {
    if (!state.enabled) return 'PAUSE';
    if (isPostingDue()) return '0:00';

    const seconds = Math.ceil((state.nextAt - Date.now()) / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  function hasSavedPanelPosition() {
    try {
      return Boolean(localStorage.getItem(PANEL_POSITION_KEY));
    } catch {
      return false;
    }
  }

  function visibleOtherPanelRects() {
    return OTHER_MM_PANELS
      .map((id) => document.getElementById(id))
      .filter((el) => el instanceof HTMLElement && isVisible(el))
      .map((el) => el.getBoundingClientRect());
  }

  function overlapArea(a, b, gap) {
    const g = Number(gap) || 8;
    const left = Math.max(a.left - g, b.left);
    const right = Math.min(a.right + g, b.right);
    const top = Math.max(a.top - g, b.top);
    const bottom = Math.min(a.bottom + g, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function resolveBottomCenterPosition() {
    const rect = panel.getBoundingClientRect();
    const width = rect.width || Math.min(390, Math.max(280, innerWidth - 24));
    const height = rect.height || 245;
    const edge = 8;
    const bottomGap = innerWidth <= 620 ? 58 : 72;
    const maxLeft = Math.max(edge, innerWidth - width - edge);
    const maxTop = Math.max(edge, innerHeight - height - edge);
    const baseLeft = Math.min(maxLeft, Math.max(edge, (innerWidth - width) / 2));
    const baseTop = Math.min(maxTop, Math.max(edge, innerHeight - height - bottomGap));
    const obstacles = visibleOtherPanelRects();
    const stepX = width + 12;
    const stepY = Math.max(56, Math.min(height * 0.72, 180));

    const candidates = [
      [baseLeft, baseTop],
      [baseLeft - stepX, baseTop],
      [baseLeft + stepX, baseTop],
      [baseLeft, baseTop - stepY],
      [baseLeft - stepX * 0.55, baseTop - stepY],
      [baseLeft + stepX * 0.55, baseTop - stepY],
      [baseLeft, baseTop - stepY * 2],
    ].map((pair) => ({
      left: Math.min(maxLeft, Math.max(edge, pair[0])),
      top: Math.min(maxTop, Math.max(edge, pair[1])),
    }));

    candidates.forEach((candidate) => {
      const box = {
        left: candidate.left,
        top: candidate.top,
        right: candidate.left + width,
        bottom: candidate.top + height,
      };
      candidate.overlap = obstacles.reduce((sum, obstacle) => sum + overlapArea(box, obstacle, 8), 0);
      candidate.distance = Math.hypot(candidate.left - baseLeft, candidate.top - baseTop);
    });

    candidates.sort((a, b) => a.overlap - b.overlap || a.distance - b.distance);
    return candidates[0] || { left: baseLeft, top: baseTop };
  }

  function positionPanelDefault() {
    if (!panel || panel.style.display === 'none' || hasSavedPanelPosition()) return;
    const pos = resolveBottomCenterPosition();
    panel.style.left = Math.round(pos.left) + 'px';
    panel.style.top = Math.round(pos.top) + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function injectStyle() {
    if (document.getElementById(APP_ID + '-style')) return;

    const style = document.createElement('style');
    style.id = APP_ID + '-style';
    style.textContent = [
      '[data-mm-dock-id="' + MODULE_ID + '"] .mmba-launch-face{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}',
      '[data-mm-dock-id="' + MODULE_ID + '"] .mmba-launch-store{position:absolute;width:29px!important;height:29px!important;opacity:.25;filter:drop-shadow(0 1px 1px #000);pointer-events:none}',
      '[data-mm-dock-id="' + MODULE_ID + '"] .mmba-launch-timer{position:relative;z-index:1;color:#f1f3f4;font:700 9.5px/1 Arial,sans-serif;letter-spacing:-.25px;text-shadow:0 1px 2px #000,0 0 3px #000;pointer-events:none}',
      '[data-mm-dock-id="' + MODULE_ID + '"][data-mm-due="1"] .mmba-launch-timer{color:#ffd66d}',
      '[data-mm-dock-id="' + MODULE_ID + '"][data-mm-due="1"] .mmba-launch-store{opacity:.42}',
      '#' + APP_ID + '{display:none;position:fixed;z-index:2147483646;width:min(390px,calc(100vw - 24px));max-height:calc(100vh - 88px);overflow:hidden;color:#eee;background:#111;border:1px solid #8b6a2f;border-radius:8px;box-shadow:0 12px 35px #000b;font:12px/1.35 Arial,sans-serif}',
      '#' + APP_ID + ' *{box-sizing:border-box}',
      '#' + APP_ID + ' .mmba-head{height:40px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 8px 0 10px;background:#151515;border-bottom:1px solid #6f5426}',
      '#' + APP_ID + ' .mmba-head strong{color:#e7b83f;font-size:13px}',
      '#' + APP_ID + ' button,#' + APP_ID + ' select{color:#eee;background:#242424;border:1px solid #555;border-radius:5px;padding:5px 7px}',
      '#' + APP_ID + ' button:hover{border-color:#9a7418}',
      '#' + APP_ID + ' .mmba-close{width:27px;height:27px;padding:0;font-size:16px;line-height:1}',
      '#' + APP_ID + ' .mmba-body{padding:8px 10px 10px;overflow:auto;max-height:calc(100vh - 150px)}',
      '#' + APP_ID + ' .mmba-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:6px}',
      '#' + APP_ID + ' .mmba-message{min-height:64px;padding:7px;border:1px solid #333;border-radius:5px;background:#090909;word-break:break-word;margin-bottom:7px}',
      '#' + APP_ID + ' .mmba-message a{color:#70aee8}',
      '#' + APP_ID + ' .mmba-meta{color:#aaa}',
      '#' + APP_ID + ' .mmba-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px}',
      '#' + APP_ID + ' .mmba-actions button:first-child{border-color:#9a7418}',
      '#' + APP_ID + ' .mmba-note{margin-top:7px;color:#8fd59a}',
      '@media(max-width:620px){[data-mm-dock-id="' + MODULE_ID + '"] .mmba-launch-timer{font-size:9px}#' + APP_ID + '{width:calc(100vw - 8px);max-height:calc(100vh - 62px)}#' + APP_ID + ' .mmba-body{max-height:calc(100vh - 106px)}}',
    ].join('\n');

    document.head.appendChild(style);
  }

  function launcherMarkup() {
    return [
      '<span class="mmba-launch-face" aria-hidden="true">',
      '<svg class="mmba-launch-store" viewBox="0 0 24 24">',
      '<path d="M4 10h16l-1.3-4H5.3L4 10Zm1 0v8h14v-8M8 18v-5h4v5M4 10c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2c0 1.1.9 2 2 2s2-.9 2-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      '</svg>',
      '<span class="mmba-launch-timer" data-mm-bazaar-timer>0:00</span>',
      '</span>',
    ].join('');
  }

  function renderLauncher() {
    const button = document.querySelector('[data-mm-dock-id="' + MODULE_ID + '"]');
    if (!button) return;

    const timer = button.querySelector('[data-mm-bazaar-timer]');
    if (timer) timer.textContent = formatCountdown();
    button.dataset.mmDue = state.enabled && isPostingDue() ? '1' : '0';
  }

  function createLauncher() {
    if (!core || !core.registerDockLauncher) return null;

    const button = core.registerDockLauncher({
      id: MODULE_ID,
      label: 'MM Bazaar Reminder',
      accent: '#8a6a16',
      icon: launcherMarkup(),
      onClick: togglePanel,
    });

    renderLauncher();
    return button;
  }

  function createPanel() {
    if (panel && panel.isConnected) return panel;

    injectStyle();

    panel = document.createElement('section');
    panel.id = APP_ID;
    panel.innerHTML = [
      '<div class="mmba-head">',
      '<strong>Manic’s Madhouse Bazaar</strong>',
      '<button type="button" class="mmba-close" data-act="close" aria-label="Close">×</button>',
      '</div>',
      '<div class="mmba-body">',
      '<div class="mmba-row"><span data-role="status">Ready</span><strong data-role="countdown">0:00</strong></div>',
      '<div class="mmba-message" data-role="message"></div>',
      '<div class="mmba-row mmba-meta"><span data-role="chars"></span><select data-role="mode">',
      '<option value="busy">Busy 5–8 min</option>',
      '<option value="normal">Normal 8–12 min</option>',
      '<option value="quiet">Quiet 15–20 min</option>',
      '</select></div>',
      '<div class="mmba-actions">',
      '<button type="button" data-act="fill">Fill Bazaar</button>',
      '<button type="button" data-act="sent">Mark Sent</button>',
      '<button type="button" data-act="toggle"></button>',
      '<button type="button" data-act="bazaar">Open Bazaar</button>',
      '</div>',
      '<div class="mmba-note" data-role="note">One fill per opened session. Send remains manual.</div>',
      '</div>',
    ].join('');

    document.body.appendChild(panel);

    panel.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;

      const action = button.dataset.act;
      if (action === 'close') {
        closePanel();
        return;
      }
      if (action === 'toggle') {
        state.enabled = !state.enabled;
        saveState();
        render();
        return;
      }
      if (action === 'sent') {
        completeAssistedPost();
        return;
      }
      if (action === 'bazaar') {
        window.open(BAZAAR_URL, '_blank', 'noopener');
        return;
      }
      if (action === 'fill') {
        const result = fillCurrentSession();
        setNote(result.ok ? 'Bazaar message filled. Review it, then send manually.' : result.reason, result.ok);
      }
    });

    panel.querySelector('[data-role="mode"]').addEventListener('change', (event) => {
      state.mode = event.target.value;
      if (state.nextAt && state.nextAt > Date.now()) scheduleNext(Date.now());
      else saveState();
      render();
    });

    requestAnimationFrame(() => {
      const head = panel.querySelector('.mmba-head');
      if (core && core.makePanelDraggable) {
        core.makePanelDraggable(panel, head, PANEL_KEY, { right: '', top: '' });
      }
      positionPanelDefault();
    });

    return panel;
  }

  function setNote(message, good) {
    if (!panel) return;
    const note = panel.querySelector('[data-role="note"]');
    if (!note) return;

    note.textContent = message;
    note.style.color = good ? '#8fd59a' : '#e7b83f';
  }

  function render() {
    renderLauncher();
    if (!panel) return;

    const status = panel.querySelector('[data-role="status"]');
    const countdown = panel.querySelector('[data-role="countdown"]');
    const preview = panel.querySelector('[data-role="message"]');
    const chars = panel.querySelector('[data-role="chars"]');
    const mode = panel.querySelector('[data-role="mode"]');
    const toggle = panel.querySelector('[data-act="toggle"]');

    if (status) {
      status.textContent = state.enabled
        ? 'Bazaar • ' + state.completedCount + ' completed'
        : 'Paused';
    }
    if (countdown) countdown.textContent = formatCountdown();
    if (preview) preview.textContent = BAZAAR_MESSAGE;
    if (chars) chars.textContent = codePointLength(BAZAAR_MESSAGE) + '/' + TRADE_LIMIT + ' chars';
    if (mode) mode.value = state.mode;
    if (toggle) toggle.textContent = state.enabled ? 'Pause' : 'Resume';
  }

  function closePanel() {
    if (panel) panel.style.display = 'none';
    if (core && core.setDockLauncherActive) core.setDockLauncherActive(MODULE_ID, false);
  }

  function openPanel() {
    const root = createPanel();

    sessionId += 1;
    sessionFilled = false;
    submitArmed = false;
    lastComposer = null;

    root.style.display = 'block';
    root.style.zIndex = '2147483647';

    if (core && core.setDockLauncherActive) core.setDockLauncherActive(MODULE_ID, true);
    requestAnimationFrame(positionPanelDefault);
    render();

    const openedSessionId = sessionId;
    setTimeout(() => preparePostingSession(openedSessionId), 0);
  }

  function togglePanel() {
    const root = createPanel();
    if (!root.style.display || root.style.display === 'none') openPanel();
    else closePanel();
  }

  function boot() {
    if (document.querySelector('[data-mm-dock-id="' + MODULE_ID + '"]')) return;

    injectStyle();

    if (!core || !core.registerDockLauncher) {
      setTimeout(boot, 300);
      return;
    }

    createLauncher();
    render();

    document.addEventListener('keydown', handleComposerKeydown, true);
    document.addEventListener('click', handleTradeClick, true);
    document.addEventListener('input', handleComposerInput, true);
    window.addEventListener('resize', () => requestAnimationFrame(positionPanelDefault), { passive: true });

    setInterval(render, TICK_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
