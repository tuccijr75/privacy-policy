// ==UserScript==
// @name         MM Trade Chat Assistant
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-alpha.1
// @description  Manual-send Trade Chat rotation assistant for MM Torn Systems. Reminds, rotates, and pre-fills; never sends automatically.
// @updateURL    https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-trade-chat-assistant/MM_Trade_Chat_Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/tuccijr75/privacy-policy/mm-trade-chat-assistant/MM_Trade_Chat_Assistant.user.js
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  const APP_ID = 'mm-trade-chat-assistant';
  const STORAGE_KEY = 'mmTradeChatAssistantStateV1';
  const TICK_MS = 1000;
  const TRADE_LIMIT = 125;

  const MODES = {
    busy:   { label: 'Busy 5–8m',  min: 5,  max: 8 },
    normal: { label: 'Normal 8–12m', min: 8, max: 12 },
    quiet:  { label: 'Quiet 15–20m', min: 15, max: 20 },
  };

  const DEFAULT_MESSAGES = [
    '🟨 <b>MM TORN SYSTEMS</b> 🟥 | <b>50M+</b> Custom | 🛠 Repairs 25M+ | ⚙ Bazaar • Faction • API • CRM | <u>DM</u>',
    '🟨 <b>MM TORN SYSTEMS</b> 🟥 | Bazaar • ROI • Procurement • CRM | <b>50M+</b> custom | 🛠 Repairs 25M+ | <u>DM</u>',
    '🟨 <b>MM TORN SYSTEMS</b> 🟥 | Faction • Armory • Builds • War Prep • API | <b>50M+</b> custom | <u>DM</u>',
    '🟨 <b>MM TORN SYSTEMS</b> 🟥 | TornPDA • Desktop • API • Analytics | <b>50M+</b> custom | 🛠 25M+ repairs | <u>DM</u>',
    '<b>MM TORN SYSTEMS</b> | <b>50M+</b> custom | <a href="/forums.php#/p=threads&f=67&t=16608018">INFO</a> | <u>DM</u>',
  ];

  const defaults = {
    enabled: true,
    mode: 'normal',
    index: 0,
    nextAt: 0,
    lastSentAt: 0,
    messages: DEFAULT_MESSAGES,
    autoFillWhenDue: true,
    collapsed: false,
  };

  const loadState = () => {
    const saved = GM_getValue(STORAGE_KEY, null);
    const state = saved && typeof saved === 'object' ? { ...defaults, ...saved } : { ...defaults };
    if (!Array.isArray(state.messages) || !state.messages.length) state.messages = [...DEFAULT_MESSAGES];
    if (!MODES[state.mode]) state.mode = 'normal';
    state.index = Number.isInteger(state.index) ? Math.max(0, state.index % state.messages.length) : 0;
    return state;
  };

  let state = loadState();
  let panel = null;
  let lastFilledMessage = '';
  let lastComposer = null;

  const saveState = () => GM_setValue(STORAGE_KEY, state);

  const codePointLength = (s) => Array.from(String(s)).length;

  const randomDelayMs = () => {
    const mode = MODES[state.mode] || MODES.normal;
    const minutes = mode.min + Math.random() * (mode.max - mode.min);
    return Math.round(minutes * 60_000);
  };

  const currentMessage = () => state.messages[state.index % state.messages.length];

  const scheduleNext = (base = Date.now()) => {
    state.nextAt = base + randomDelayMs();
    saveState();
  };

  const rotate = () => {
    state.index = (state.index + 1) % state.messages.length;
    saveState();
  };

  const markSent = () => {
    const now = Date.now();
    if (now - state.lastSentAt < 5000) return;
    state.lastSentAt = now;
    rotate();
    scheduleNext(now);
    lastFilledMessage = '';
    render();
  };

  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
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
      el.getAttribute?.('placeholder'),
      el.getAttribute?.('aria-label'),
      el.getAttribute?.('data-placeholder'),
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

  const fillComposer = ({ force = false } = {}) => {
    if (!state.enabled) return { ok: false, reason: 'Assistant disabled.' };
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      return { ok: false, reason: 'Return to the focused Torn tab first.' };
    }

    const composer = findTradeComposer();
    if (!composer) return { ok: false, reason: 'Open Trade Chat first.' };

    const existing = composerValue(composer).trim();
    if (existing && !force && existing !== lastFilledMessage.trim()) {
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
    render();
    return { ok: true };
  };

  const maybeAutoFill = () => {
    if (!state.enabled || !state.autoFillWhenDue || !state.nextAt || Date.now() < state.nextAt) return;
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const composer = findTradeComposer();
    if (!composer) return;
    const existing = composerValue(composer).trim();
    if (!existing) fillComposer();
  };

  const formatRemaining = () => {
    if (!state.enabled) return 'Paused';
    if (!state.nextAt) return 'Ready to start';
    const delta = state.nextAt - Date.now();
    if (delta <= 0) return 'DUE';
    const sec = Math.ceil(delta / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  const createPanel = () => {
    const root = document.createElement('div');
    root.id = APP_ID;
    root.innerHTML = `
      <div class="mmta-head">
        <strong>MM Trade Rotation</strong>
        <button type="button" data-act="collapse">–</button>
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
            <option value="busy">Busy 5–8m</option>
            <option value="normal">Normal 8–12m</option>
            <option value="quiet">Quiet 15–20m</option>
          </select>
        </div>
        <div class="mmta-actions">
          <button type="button" data-act="fill">Fill Trade</button>
          <button type="button" data-act="sent">Mark Sent</button>
          <button type="button" data-act="skip">Next Copy</button>
          <button type="button" data-act="toggle"></button>
        </div>
        <label class="mmta-check">
          <input type="checkbox" data-role="autofill"> Fill automatically when due, only while Trade Chat is open and this Torn tab is focused
        </label>
        <div class="mmta-note" data-role="note">Never sends automatically.</div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #${APP_ID} {
        position: fixed; right: 16px; bottom: 74px; z-index: 2147483000;
        width: 330px; color: #eee; background: #111; border: 1px solid #9a7418;
        border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.45);
        font: 12px/1.35 Arial, sans-serif;
      }
      #${APP_ID} * { box-sizing: border-box; }
      #${APP_ID} .mmta-head { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #4a3b17; }
      #${APP_ID} .mmta-head strong { color:#e7b83f; font-size:13px; }
      #${APP_ID} button, #${APP_ID} select {
        color:#eee; background:#242424; border:1px solid #555; border-radius:5px; padding:5px 7px;
      }
      #${APP_ID} button:hover { border-color:#b88a1d; }
      #${APP_ID} .mmta-body { padding:8px 10px 10px; }
      #${APP_ID} .mmta-row { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-bottom:6px; }
      #${APP_ID} [data-role="countdown"].due { color:#e7b83f; }
      #${APP_ID} .mmta-message {
        min-height:52px; padding:7px; border:1px solid #333; border-radius:5px;
        background:#090909; white-space:pre-wrap; word-break:break-word; margin-bottom:7px;
      }
      #${APP_ID} .mmta-meta { color:#aaa; }
      #${APP_ID} .mmta-actions { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
      #${APP_ID} .mmta-actions button:first-child { border-color:#9a7418; }
      #${APP_ID} .mmta-check { display:block; margin-top:7px; color:#bbb; }
      #${APP_ID} .mmta-note { margin-top:6px; color:#8fd59a; }
      #${APP_ID}.collapsed .mmta-body { display:none; }
    `;
    document.documentElement.append(style);
    document.body.append(root);

    root.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;
      const act = button.dataset.act;

      if (act === 'collapse') {
        state.collapsed = !state.collapsed;
        saveState();
        render();
      } else if (act === 'toggle') {
        state.enabled = !state.enabled;
        if (state.enabled && !state.nextAt) scheduleNext();
        saveState();
        render();
      } else if (act === 'fill') {
        const result = fillComposer({ force: false });
        note(result.ok ? 'Trade message filled. Review it, then press Send yourself.' : result.reason, result.ok);
      } else if (act === 'sent') {
        markSent();
        note('Marked sent. Next copy scheduled.', true);
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

    root.querySelector('[data-role="autofill"]').addEventListener('change', (event) => {
      state.autoFillWhenDue = event.target.checked;
      saveState();
      render();
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
    if (!panel) return;
    panel.classList.toggle('collapsed', !!state.collapsed);
    panel.querySelector('[data-act="collapse"]').textContent = state.collapsed ? '+' : '–';

    const message = currentMessage();
    const countdown = formatRemaining();
    const countNode = panel.querySelector('[data-role="countdown"]');
    countNode.textContent = countdown;
    countNode.classList.toggle('due', countdown === 'DUE');

    panel.querySelector('[data-role="status"]').textContent =
      state.enabled ? `Copy ${state.index + 1}/${state.messages.length}` : 'Paused';
    panel.querySelector('[data-role="message"]').textContent = message;
    panel.querySelector('[data-role="chars"]').textContent =
      `${codePointLength(message)}/${TRADE_LIMIT} chars`;
    panel.querySelector('[data-role="mode"]').value = state.mode;
    panel.querySelector('[data-role="autofill"]').checked = !!state.autoFillWhenDue;
    panel.querySelector('[data-act="toggle"]').textContent = state.enabled ? 'Pause' : 'Resume';
  };

  const observeManualSend = (event) => {
    if (!state.enabled) return;
    const composer = findTradeComposer();
    if (!composer || event.target !== composer) return;

    if (event.type === 'keydown' && event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      const before = composerValue(composer).trim();
      const expected = (lastFilledMessage || currentMessage()).trim();
      if (before && before === expected) setTimeout(markSent, 200);
    }
  };

  const observeComposerCleared = (event) => {
    if (!state.enabled || !lastFilledMessage) return;
    const composer = findTradeComposer();
    if (!composer || event.target !== composer) return;
    if (!composerValue(composer).trim()) {
      setTimeout(markSent, 150);
    }
  };

  const boot = () => {
    if (document.getElementById(APP_ID)) return;
    panel = createPanel();
    if (state.enabled && !state.nextAt) scheduleNext();
    render();

    document.addEventListener('keydown', observeManualSend, true);
    document.addEventListener('input', observeComposerCleared, true);
    window.addEventListener('focus', maybeAutoFill);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') maybeAutoFill();
    });

    setInterval(() => {
      render();
      maybeAutoFill();
    }, TICK_MS);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
