// ==UserScript==
// @name         MM Trade Chat Assistant
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-alpha.8
// @description  Manual-send Trade Chat rotation assistant for MM Torn Systems. Reminds, rotates, and pre-fills; never sends automatically.
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-trade-chat-assistant/MM_Trade_Chat_Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-trade-chat-assistant/MM_Trade_Chat_Assistant.user.js
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js?v=8.0.0-alpha.8
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  const APP_ID = 'mm-trade-chat-assistant';
  const STORAGE_ID = 'mmTradeChatAssistantStateV1';
  const TICK_MS = 1000;
  const TRADE_LIMIT = 125;
  const MODULE_ID = 'trade-reminder';
  const LAUNCHER_ID = 'mm-trade-chat-assistant-launcher';
  const PANEL_KEY = 'trade-reminder';
  const PANEL_STORAGE_ID = 'mm_torn_panel_position_v1:' + PANEL_KEY;
  const OTHER_MM_PANELS = [
    'mm-acquisitions',
    'mm-bazaar-manager',
    'mm-customers',
    'mm-faction-armory',
    'mm-inventory-roi',
    'mm-market-scout',
  ];
  const core = globalThis.MMTornCore;

  const MODES = {
    busy:   { label: 'Busy 5–8 min',  min: 5,  max: 8 },
    normal: { label: 'Normal 8–12 min', min: 8, max: 12 },
    quiet:  { label: 'Quiet 15–20 min', min: 15, max: 20 },
  };

  const ROTATION_MESSAGES = Object.freeze([
    '<b>[*] MM TORN SYSTEMS</b> | Custom 50M+ • Repair 25M+ | DM: <a href="/profiles.php?XID=4325346">Manic-Mike [4325346]</a>',
    '<b>[$] MM TORN SYSTEMS</b> | Bazaar • ROI • Procure | 50M+ | DM: <a href="/profiles.php?XID=4325346">Manic-Mike [4325346]</a>',
    '<b>[+] MM TORN SYSTEMS</b> | Armory • Builds • War | 50M+ | DM: <a href="/profiles.php?XID=4325346">Manic-Mike [4325346]</a>',
    '<b>[@] MM TORN SYSTEMS</b> | TornPDA • API • Data | 50M+ | DM: <a href="/profiles.php?XID=4325346">Manic-Mike [4325346]</a>',
    '<b>[i] MM TORN SYSTEMS</b> | 50M+ Custom • 25M+ Repair | <a href="/forums.php#/p=threads&f=67&t=16608018">INFO + CONTACT</a>',
  ]);

  const loadState = () => {
    const saved = GM_getValue(STORAGE_ID, null);
    const src = saved && typeof saved === 'object' ? saved : {};
    const mode = MODES[src.mode] ? src.mode : 'normal';
    const rawIndex = Number.isInteger(src.index) ? src.index : 0;

    return {
      enabled: src.enabled !== false,
      mode,
      index: Math.max(0, rawIndex % ROTATION_MESSAGES.length),
      nextAt: Number.isFinite(src.nextAt) ? src.nextAt : 0,
      lastSentAt: Number.isFinite(src.lastSentAt) ? src.lastSentAt : 0,
      completedCount: Number.isFinite(src.completedCount) ? src.completedCount : 0,
      lastCompletedAt: Number.isFinite(src.lastCompletedAt) ? src.lastCompletedAt : 0,
    };
  };

  let state = loadState();
  let panel = null;
  let lastFilledMessage = '';
  let lastComposer = null;
  let panelSessionId = 0;
  let sessionFilled = false;

  const saveState = () => GM_setValue(STORAGE_ID, state);

  const codePointLength = (s) => Array.from(String(s)).length;

  const randomDelayMs = () => {
    const mode = MODES[state.mode] || MODES.normal;
    const minutes = mode.min + Math.random() * (mode.max - mode.min);
    return Math.round(minutes * 60_000);
  };

  const currentMessage = () => ROTATION_MESSAGES[state.index % ROTATION_MESSAGES.length];

  const scheduleNext = (base = Date.now()) => {
    state.nextAt = base + randomDelayMs();
    saveState();
  };

  const rotate = () => {
    state.index = (state.index + 1) % ROTATION_MESSAGES.length;
    saveState();
  };

  const buttonLabel = (el) => [
    el?.getAttribute?.('aria-label'),
    el?.getAttribute?.('title'),
    el?.getAttribute?.('data-title'),
    el?.innerText,
    el?.textContent,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();

  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  };


  const findTradeOpenControl = () => {
    const controls = [...document.querySelectorAll('button,[role="button"]')]
      .filter(visible)
      .filter(el => !el.closest?.('#' + APP_ID));

    return controls.find(el => {
      const label = buttonLabel(el);
      if (!/(^|\s)trade(\s|$)/.test(label)) return false;
      if (/minimi[sz]e|close/.test(label)) return false;
      return !/mm trade rotation/.test(ancestorText(el, 4));
    }) || null;
  };

  const findTradeMinimizeControl = () => {
    const controls = [...document.querySelectorAll('button,[role="button"]')]
      .filter(visible)
      .filter(el => !el.closest?.('#' + APP_ID));

    return controls.find(el => {
      const label = buttonLabel(el);
      const around = ancestorText(el, 5);
      return (/trade/.test(label) && /minimi[sz]e/.test(label))
        || (/minimi[sz]e/.test(label) && /trade/.test(around));
    }) || null;
  };

  const ancestorText = (el, maxDepth = 8) => {
    let node = el;
    const chunks = [];
    for (let i = 0; node && i < maxDepth; i++, node = node.parentElement) {
      chunks.push(node.getAttribute?.('aria-label') || '');
      chunks.push(node.getAttribute?.('data-title') || '');
      chunks.push(node.getAttribute?.('title') || '');
      if (i <= 3) chunks.push(node.innerText || '');
    }
    return chunks.join(' ').replace(/\s+/g, ' ').toLowerCase();
  };

  const composerScore = (el) => {
    if (!visible(el) || el.closest?.('#' + APP_ID)) return -999;
    const meta = [
      el.getAttribute?.('place' + 'holder'),
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('data-' + 'place' + 'holder'),
      el.getAttribute?.('role'),
      el.className,
    ].filter(Boolean).join(' ').toLowerCase();

    const around = ancestorText(el);
    let score = 0;
    if (/message|chat|type|write|send/.test(meta)) score += 4;
    if (/trade/.test(around)) score += 8;
    if (/global|faction|company/.test(around) && !/trade/.test(around)) score -= 5;
    if (el.matches('textarea')) score += 2;
    if (el.matches('[contenteditable="true"]')) score += 3;
    if (el.matches('input[type="text"]')) score += 1;
    const r = el.getBoundingClientRect();
    if (r.bottom > innerHeight * 0.45) score += 1;
    return score;
  };

  const findTradeComposer = () => {
    const candidates = [...document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]')]
      .filter(visible)
      .map(el => ({ el, score: composerScore(el) }))
      .filter(x => x.score >= 7)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  };


  const waitForTradeComposer = (timeoutMs = 1800) => new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const composer = findTradeComposer();
      if (composer) return resolve(composer);
      if (Date.now() - start >= timeoutMs) return resolve(null);
      setTimeout(check, 80);
    };
    check();
  });

  const ensureTradeComposerFromUserGesture = async () => {
    const existing = findTradeComposer();
    if (existing) return existing;

    const control = findTradeOpenControl();
    if (!control) return null;

    control.click();
    return waitForTradeComposer();
  };

  const minimizeTradeChat = () => {
    const control = findTradeMinimizeControl();
    if (control) control.click();
  };

  const composerValue = (el) => {
    if (!el) return '';
    if (el.matches('textarea, input')) return el.value || '';
    return el.innerText || el.textContent || '';
  };

  const setNativeValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const fillComposer = () => {
    if (!state.enabled) return { ok: false, reason: 'Assistant disabled.' };
    if (sessionFilled) return { ok: false, reason: 'This posting session has already been filled once.' };
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      return { ok: false, reason: 'Return to the focused Torn tab first.' };
    }

    const composer = findTradeComposer();
    if (!composer) return { ok: false, reason: 'Open Trade Chat first.' };

    const existing = composerValue(composer).trim();
    if (existing) {
      return { ok: false, reason: 'Trade composer already contains text.' };
    }

    const message = currentMessage();
    if (codePointLength(message) > TRADE_LIMIT) {
      return { ok: false, reason: 'Current rotation message exceeds 125 characters.' };
    }

    composer.focus({ preventScroll: true });
    if (composer.matches('textarea, input')) {
      setNativeValue(composer, message);
    } else {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, message);
      selection.removeAllRanges();
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: message,
      }));
    }

    lastFilledMessage = message;
    lastComposer = composer;
    sessionFilled = true;
    render();
    return { ok: true };
  };


  const completeAssistedPost = () => {
    const now = Date.now();
    if (now - state.lastSentAt < 5000) return;
    state.lastSentAt = now;
    state.completedCount = Number(state.completedCount || 0) + 1;
    state.lastCompletedAt = now;
    rotate();
    scheduleNext(now);
    lastFilledMessage = '';
    lastComposer = null;
    render();
    closePanel();
    setTimeout(minimizeTradeChat, 120);
  };

  const prepareTradeOnPanelOpen = async (sessionId) => {
    if (!state.enabled || sessionId !== panelSessionId || sessionFilled) return;
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      note('Return to the focused Torn tab first.');
      return;
    }

    const composer = await ensureTradeComposerFromUserGesture();
    if (sessionId !== panelSessionId || sessionFilled) return;
    if (!composer) {
      note('Trade Chat could not be opened. Open it manually, then use Fill Trade.');
      return;
    }

    const result = fillComposer();
    note(
      result.ok
        ? 'Next rotation message is ready in Trade Chat. Review it, then send manually.'
        : result.reason,
      result.ok
    );
  };

  const formatRemaining = () => {
    if (!state.enabled) return 'Paused';
    if (!state.nextAt) return 'Ready to start';
    const delta = state.nextAt - Date.now();
    if (delta <= 0) return 'DUE';
    const sec = Math.ceil(delta / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  const injectStyle = () => {
    if (document.getElementById(APP_ID + '-style')) return;
    const style = document.createElement('style');
    style.id = APP_ID + '-style';
    style.textContent = `
      [data-mm-dock-id="${MODULE_ID}"] .mmta-launch-face {
        position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;
      }
      [data-mm-dock-id="${MODULE_ID}"] .mmta-launch-bell {
        position:absolute;width:27px!important;height:27px!important;opacity:.24;filter:drop-shadow(0 1px 1px #000);pointer-events:none;
      }
      [data-mm-dock-id="${MODULE_ID}"] .mmta-launch-timer {
        position:relative;z-index:1;color:#f1f3f4;font:700 9.5px/1 Arial,sans-serif;letter-spacing:-.25px;
        text-shadow:0 1px 2px #000,0 0 3px #000;pointer-events:none;
      }
      [data-mm-dock-id="${MODULE_ID}"][data-mm-due="1"] .mmta-launch-timer { color:#ffd66d; }
      [data-mm-dock-id="${MODULE_ID}"][data-mm-due="1"] .mmta-launch-bell { opacity:.38; }

      #${APP_ID} {
        display:none;position:fixed;z-index:2147483646;width:min(390px,calc(100vw - 24px));
        max-height:calc(100vh - 88px);overflow:hidden;color:#eee;background:#111;border:1px solid #8b6a2f;
        border-radius:8px;box-shadow:0 12px 35px #000b;font:12px/1.35 Arial,sans-serif;
      }
      #${APP_ID} * { box-sizing:border-box; }
      #${APP_ID} .mmta-head {
        height:40px;display:flex;align-items:center;justify-content:space-between;gap:8px;
        padding:0 8px 0 10px;background:#151515;border-bottom:1px solid #6f5426;
      }
      #${APP_ID} .mmta-head strong { color:#e7b83f;font-size:13px; }
      #${APP_ID} button,#${APP_ID} select {
        color:#eee;background:#242424;border:1px solid #555;border-radius:5px;padding:5px 7px;
      }
      #${APP_ID} button:hover { border-color:#9a7418; }
      #${APP_ID} .mmta-close { width:27px;height:27px;padding:0;font-size:16px;line-height:1; }
      #${APP_ID} .mmta-body { padding:8px 10px 10px;overflow:auto;max-height:calc(100vh - 150px); }
      #${APP_ID} .mmta-row { display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:6px; }
      #${APP_ID} [data-role="countdown"].due { color:#e7b83f; }
      #${APP_ID} .mmta-message {
        min-height:52px;padding:7px;border:1px solid #333;border-radius:5px;background:#090909;
        white-space:pre-wrap;word-break:break-word;margin-bottom:7px;
      }
      #${APP_ID} .mmta-meta { color:#aaa; }
      #${APP_ID} .mmta-actions { display:grid;grid-template-columns:1fr 1fr;gap:5px; }
      #${APP_ID} .mmta-actions button:first-child { border-color:#9a7418; }
      #${APP_ID} .mmta-note { margin-top:6px;color:#8fd59a; }
      @media(max-width:620px){
        [data-mm-dock-id="${MODULE_ID}"] .mmta-launch-timer { font-size:9px; }
        #${APP_ID}{width:calc(100vw - 8px);max-height:calc(100vh - 62px)}
        #${APP_ID} .mmta-body{max-height:calc(100vh - 106px)}
      }
    `;
    document.head.appendChild(style);
  };

  const launcherMarkup = () => `
    <span class="mmta-launch-face" aria-hidden="true">
      <svg class="mmta-launch-bell" viewBox="0 0 24 24">
        <path d="M6.8 16.5h10.4l-1.5-2.1V10a3.7 3.7 0 0 0-7.4 0v4.4zM10 18.2a2.2 2.2 0 0 0 4 0"
          fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="mmta-launch-timer" data-mm-trade-timer>--:--</span>
    </span>
  `;

  const hasSavedPanelPosition = () => {
    try { return Boolean(localStorage.getItem(PANEL_STORAGE_ID)); } catch { return false; }
  };

  const panelRectAt = (left, top, width, height) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  });

  const overlapArea = (a, b, gap = 8) => {
    const left = Math.max(a.left - gap, b.left);
    const right = Math.min(a.right + gap, b.right);
    const top = Math.max(a.top - gap, b.top);
    const bottom = Math.min(a.bottom + gap, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  };

  const visibleMmPanelRects = () => OTHER_MM_PANELS
    .map(id => document.getElementById(id))
    .filter(el => el instanceof HTMLElement && el !== panel)
    .filter(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || 1) > 0
        && r.width > 80 && r.height > 60;
    })
    .map(el => el.getBoundingClientRect());

  const resolveBottomCenterPanelPosition = () => {
    const rect = panel.getBoundingClientRect();
    const width = rect.width || Math.min(390, Math.max(280, innerWidth - 24));
    const height = rect.height || 250;
    const edge = 8;
    const bottomGap = innerWidth <= 620 ? 58 : 72;
    const maxLeft = Math.max(edge, innerWidth - width - edge);
    const maxTop = Math.max(edge, innerHeight - height - edge);
    const baseLeft = Math.min(maxLeft, Math.max(edge, (innerWidth - width) / 2));
    const baseTop = Math.min(maxTop, Math.max(edge, innerHeight - height - bottomGap));
    const obstacles = visibleMmPanelRects();
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
    ].map(([left, top]) => ({
      left: Math.min(maxLeft, Math.max(edge, left)),
      top: Math.min(maxTop, Math.max(edge, top)),
    }));

    const scored = candidates.map(pos => {
      const candidate = panelRectAt(pos.left, pos.top, width, height);
      const overlap = obstacles.reduce((sum, obstacle) => sum + overlapArea(candidate, obstacle), 0);
      const distance = Math.hypot(pos.left - baseLeft, pos.top - baseTop);
      return { ...pos, overlap, distance };
    }).sort((a, b) => a.overlap - b.overlap || a.distance - b.distance);

    return scored[0] || { left: baseLeft, top: baseTop };
  };

  const positionPanelDefault = () => {
    if (!panel || panel.style.display === 'none' || hasSavedPanelPosition()) return;
    const pos = resolveBottomCenterPanelPosition();
    panel.style.left = Math.round(pos.left) + 'px';
    panel.style.right = 'auto';
    panel.style.top = Math.round(pos.top) + 'px';
    panel.style.bottom = 'auto';
  };

  const formatLauncherTimer = () => {
    if (!state.enabled) return '--:--';
    if (!state.nextAt) return '0:00';
    const delta = Math.max(0, state.nextAt - Date.now());
    const sec = Math.ceil(delta / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  const renderLauncher = () => {
    const button = document.querySelector('[data-mm-dock-id="' + MODULE_ID + '"]');
    if (!button) return;
    const timer = button.querySelector('[data-mm-trade-timer]');
    if (timer) timer.textContent = formatLauncherTimer();
    button.dataset.mmDue = state.enabled && state.nextAt && Date.now() >= state.nextAt ? '1' : '0';
  };

  const closePanel = () => {
    if (panel) panel.style.display = 'none';
    core?.setDockLauncherActive?.(MODULE_ID, false);
  };

  const openPanel = () => {
    const root = createPanel();
    panelSessionId += 1;
    sessionFilled = false;
    root.style.display = 'block';
    root.style.zIndex = '2147483647';
    core?.setDockLauncherActive?.(MODULE_ID, true);
    requestAnimationFrame(positionPanelDefault);
    render();
    const sessionId = panelSessionId;
    setTimeout(() => prepareTradeOnPanelOpen(sessionId), 0);
  };

  const togglePanel = () => {
    const root = createPanel();
    if (root.style.display === 'none' || !root.style.display) openPanel();
    else closePanel();
  };

  const createLauncher = () => {
    if (!core?.registerDockLauncher) return null;
    const button = core.registerDockLauncher({
      id: MODULE_ID,
      label: 'MM Trade Reminder',
      accent: '#75602f',
      icon: launcherMarkup(),
      onClick: togglePanel,
    });
    if (button) {
      button.id = LAUNCHER_ID;
      renderLauncher();
    }
    return button;
  };

  const createPanel = () => {
    if (panel?.isConnected) return panel;
    injectStyle();
    const root = document.createElement('section');
    root.id = APP_ID;
    root.innerHTML = `
      <div class="mmta-head">
        <strong>MM Trade Rotation</strong>
        <button type="button" class="mmta-close" data-act="close" aria-label="Close">×</button>
      </div>
      <div class="mmta-body">
        <div class="mmta-row">
          <span data-role="status">Ready</span>
          <strong data-role="countdown">Ready to start</strong>
        </div>
        <div class="mmta-message" data-role="message"></div>
        <div class="mmta-row mmta-meta">
          <span data-role="chars"></span>
          <select data-role="mode">
            <option value="busy">Busy 5–8 min</option>
            <option value="normal">Normal 8–12 min</option>
            <option value="quiet">Quiet 15–20 min</option>
          </select>
        </div>
        <div class="mmta-actions">
          <button type="button" data-act="fill">Fill Trade</button>
          <button type="button" data-act="sent">Mark Sent</button>
          <button type="button" data-act="skip">Next Copy</button>
          <button type="button" data-act="toggle"></button>
        </div>
        <div class="mmta-note" data-role="note">One fill per opened session. Never sends automatically.</div>
      </div>
    `;
    document.body.append(root);
    panel = root;

    root.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;
      const act = button.dataset.act;

      if (act === 'close') {
        closePanel();
      } else if (act === 'toggle') {
        state.enabled = !state.enabled;
        if (state.enabled && !state.nextAt) scheduleNext();
        saveState();
        render();
      } else if (act === 'fill') {
        const result = fillComposer();
        note(result.ok ? 'Trade message filled. Review it, then press Send yourself.' : result.reason, result.ok);
      } else if (act === 'sent') {
        completeAssistedPost();
      } else if (act === 'skip') {
        rotate();
        render();
        note('Rotated to the next copy.', true);
      }
    });

    root.querySelector('[data-role="mode"]').addEventListener('change', (event) => {
      state.mode = event.target.value;
      if (state.enabled) scheduleNext(Date.now());
      saveState();
      render();
    });

    requestAnimationFrame(() => {
      const head = root.querySelector('.mmta-head');
      core?.makePanelDraggable?.(
        root,
        head,
        PANEL_KEY,
        { right: '', top: '' }
      );
      head?.addEventListener('dblclick', () => setTimeout(positionPanelDefault, 0));
      root.addEventListener('pointerdown', () => {
        root.style.zIndex = '2147483647';
      }, { passive: true });
      positionPanelDefault();
    });

    return root;
  };

  const note = (text, good = false) => {
    if (!panel) return;
    const node = panel.querySelector('[data-role="note"]');
    node.textContent = text;
    node.style.color = good ? '#8fd59a' : '#e7b83f';
  };

  const render = () => {
    renderLauncher();
    if (!panel) return;

    const message = currentMessage();
    const countdown = formatRemaining();
    const countNode = panel.querySelector('[data-role="countdown"]');
    countNode.textContent = countdown;
    countNode.classList.toggle('due', countdown === 'DUE');

    panel.querySelector('[data-role="status"]').textContent =
      state.enabled
        ? `Copy ${state.index + 1}/${ROTATION_MESSAGES.length} • ${Number(state.completedCount || 0)} completed`
        : 'Paused';
    panel.querySelector('[data-role="message"]').textContent = message;
    panel.querySelector('[data-role="chars"]').textContent =
      `${codePointLength(message)}/${TRADE_LIMIT} chars`;
    panel.querySelector('[data-role="mode"]').value = state.mode;
    panel.querySelector('[data-act="toggle"]').textContent = state.enabled ? 'Pause' : 'Resume';
  };

  const observeManualSend = (event) => {
    if (!state.enabled || !lastFilledMessage) return;
    const composer = lastComposer || findTradeComposer();
    if (!composer) return;

    if (event.type === 'keydown' && event.target === composer
        && event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      composer.dataset.mmTradeSubmitIntent = '1';
    }
  };

  const observeSendClick = (event) => {
    if (!state.enabled || !lastFilledMessage) return;
    const composer = lastComposer || findTradeComposer();
    const button = event.target?.closest?.('button,[role="button"]');
    if (!composer || !button || button.closest?.('#' + APP_ID)) return;

    const cr = composer.getBoundingClientRect();
    const br = button.getBoundingClientRect();
    const nearComposer = br.left >= cr.left - 12
      && br.top <= cr.bottom + 20
      && br.bottom >= cr.top - 20
      && br.left <= cr.right + 90;

    if (nearComposer) composer.dataset.mmTradeSubmitIntent = '1';
  };

  const observeComposerCleared = (event) => {
    if (!state.enabled || !lastFilledMessage) return;
    const composer = lastComposer || findTradeComposer();
    if (!composer || event.target !== composer) return;
    if (!composerValue(composer).trim() && composer.dataset.mmTradeSubmitIntent === '1') {
      delete composer.dataset.mmTradeSubmitIntent;
      setTimeout(completeAssistedPost, 150);
    }
  };

  const boot = () => {
    if (document.querySelector('[data-mm-dock-id="' + MODULE_ID + '"]')) return;
    injectStyle();

    if (!core?.registerDockLauncher) {
      setTimeout(boot, 300);
      return;
    }

    if (state.enabled && !state.nextAt) scheduleNext();
    createLauncher();
    render();

    document.addEventListener('keydown', observeManualSend, true);
    document.addEventListener('click', observeSendClick, true);
    document.addEventListener('input', observeComposerCleared, true);
    window.addEventListener('resize', () => requestAnimationFrame(positionPanelDefault), { passive: true });

    setInterval(render, TICK_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
