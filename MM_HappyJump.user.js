// ==UserScript==
// @name         MM Happy Jump
// @namespace    https://github.com/tuccijr75/MM-Torn
// @version      0.1.0-alpha.2
// @description  Guided 4 Xanax / 5 Erotic DVD / Ecstasy happy-jump timer using Torn's official cooldown API.
// @author       Manic-Mike
// @match        https://www.torn.com/*
// @run-at       document-idle
// @noframes
// @sandbox      JavaScript
// @require      https://cdn.jsdelivr.net/gh/tuccijr75/privacy-policy@410dc43062b1f72e85b5ce5b53a2166473c5732a/modular-suite/core/MM_Torn_Core.js
// @updateURL    https://raw.githack.com/tuccijr75/privacy-policy/main/MM_HappyJump.user.js
// @downloadURL  https://raw.githack.com/tuccijr75/privacy-policy/main/MM_HappyJump.user.js
// @connect      api.torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.1.0-alpha.2';
  const SCHEMA = 1;
  const MODULE_ID = 'happy-jump';
  const STATE_KEY = 'mm-happy-jump:state:v1';
  const API_KEY = 'mm-happy-jump:api-key:v1';
  const LEGACY_TIMER_KEY = 'mm.happyTimer.state';
  const XANAX_TOTAL = 4;
  const EDVD_TOTAL = 5;
  const API_FRESH_MS = 90000;
  const DRUG_WARN_MS = 300000;
  const TRAIN_WARN_MS = 120000;
  const QUARTER_MS = 900000;
  const QUARTER_GRACE_MS = 60000;
  const API_TIMEOUT_MS = 15000;

  const core = globalThis.MMTornCore;
  let state = null;
  let ui = null;
  let launcher = null;
  let ticker = null;
  let postDrugTimer = null;
  let valueListener = null;
  let syncing = false;
  let destroyed = false;
  let lastZeroSyncAt = 0;

  function blankState() {
    return {
      schema: SCHEMA,
      version: VERSION,
      revision: 0,
      configured: false,
      progress: { xanax: 0, edvd: 0, ecstasy: false, complete: false },
      cooldown: { drug: null, booster: null, fetchedAt: 0, status: 'unknown', error: '' },
      trainDeadlineAt: 0,
      lastActionAt: 0
    };
  }

  function whole(value, min, max) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
  }

  function clone(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blankState();
    if (Number(raw.schema || 0) !== SCHEMA) throw new Error('Unsupported MM Happy Jump state schema.');

    const xanax = whole(raw.progress && raw.progress.xanax, 0, XANAX_TOTAL);
    const edvd = whole(raw.progress && raw.progress.edvd, 0, EDVD_TOTAL);
    const ecstasy = raw.progress && raw.progress.ecstasy === true;
    const complete = raw.progress && raw.progress.complete === true;
    if (xanax === null || edvd === null) throw new Error('Saved Happy Jump progress is invalid.');
    if (edvd > 0 && xanax !== XANAX_TOTAL) throw new Error('DVD progress requires all 4 Xanax.');
    if (ecstasy && (xanax !== XANAX_TOTAL || edvd !== EDVD_TOTAL)) throw new Error('Ecstasy progress requires 4 Xanax and 5 DVDs.');
    if (complete && !ecstasy) throw new Error('Completed jump requires Ecstasy acknowledgement.');

    const cd = raw.cooldown && typeof raw.cooldown === 'object' ? raw.cooldown : {};
    const drugRaw = cd.drug !== undefined ? cd.drug : cd.drugSeconds;
    const boosterRaw = cd.booster !== undefined ? cd.booster : cd.boosterSeconds;
    const drug = drugRaw == null ? null : whole(drugRaw, 0, 172800);
    const booster = boosterRaw == null ? null : whole(boosterRaw, 0, 604800);
    if (drugRaw != null && drug === null) throw new Error('Saved drug cooldown is invalid.');
    if (boosterRaw != null && booster === null) throw new Error('Saved booster cooldown is invalid.');

    return {
      schema: SCHEMA,
      version: VERSION,
      revision: whole(raw.revision, 0, Number.MAX_SAFE_INTEGER) || 0,
      configured: raw.configured === true,
      progress: { xanax: xanax, edvd: edvd, ecstasy: ecstasy, complete: complete },
      cooldown: {
        drug: drug,
        booster: booster,
        fetchedAt: whole(cd.fetchedAt, 0, Number.MAX_SAFE_INTEGER) || 0,
        status: ['fresh', 'stale', 'error', 'legacy', 'unknown'].includes(cd.status) ? cd.status : 'unknown',
        error: typeof cd.error === 'string' ? cd.error.slice(0, 220) : ''
      },
      trainDeadlineAt: whole(raw.trainDeadlineAt, 0, Number.MAX_SAFE_INTEGER) || 0,
      lastActionAt: whole(raw.lastActionAt, 0, Number.MAX_SAFE_INTEGER) || 0
    };
  }

  function loadState() {
    const saved = GM_getValue(STATE_KEY, null);
    if (saved) return normalize(saved);

    const next = blankState();
    const legacy = GM_getValue(LEGACY_TIMER_KEY, null);
    const readyAt = Number(legacy && legacy.drugReadyAt || 0);
    if (Number.isFinite(readyAt) && readyAt > Date.now()) {
      next.cooldown.drug = Math.ceil((readyAt - Date.now()) / 1000);
      next.cooldown.fetchedAt = Date.now();
      next.cooldown.status = 'legacy';
      next.cooldown.error = 'Imported the earlier manual timer. Sync Torn before acting.';
    }
    GM_setValue(STATE_KEY, next);
    return next;
  }

  function save(next) {
    const clean = normalize(next);
    clean.revision = Math.max(state && state.revision || 0, clean.revision || 0) + 1;
    clean.version = VERSION;
    GM_setValue(STATE_KEY, clean);
    state = clean;
    return clean;
  }

  function change(mutator) {
    const latest = normalize(GM_getValue(STATE_KEY, state || blankState()));
    const draft = clone(latest);
    mutator(draft);
    return save(draft);
  }

  function apiKey() {
    return String(GM_getValue(API_KEY, '') || '').trim();
  }

  function validKey(value) {
    const v = String(value || '').trim();
    return v.length >= 8 && v.length <= 128 && !/\s/.test(v);
  }

  function drugRemaining(at) {
    at = Number(at || Date.now());
    if (!Number.isFinite(state.cooldown.drug) || !state.cooldown.fetchedAt) return null;
    return Math.max(0, state.cooldown.fetchedAt + state.cooldown.drug * 1000 - at);
  }

  function boosterRemaining(at) {
    at = Number(at || Date.now());
    if (!Number.isFinite(state.cooldown.booster) || !state.cooldown.fetchedAt) return null;
    return Math.max(0, state.cooldown.fetchedAt + state.cooldown.booster * 1000 - at);
  }

  function cooldownFresh(at) {
    at = Number(at || Date.now());
    return state.cooldown.status === 'fresh' &&
      state.cooldown.fetchedAt > 0 &&
      at >= state.cooldown.fetchedAt &&
      at - state.cooldown.fetchedAt <= API_FRESH_MS;
  }

  function nextQuarter(at) {
    at = Number(at || Date.now());
    return (Math.floor(at / QUARTER_MS) + 1) * QUARTER_MS;
  }

  function quarterGate(at) {
    at = Number(at || Date.now());
    const start = Math.floor(at / QUARTER_MS) * QUARTER_MS;
    if (at - start <= QUARTER_GRACE_MS) return { ready: true, ms: 0 };
    return { ready: false, ms: start + QUARTER_MS + 5000 - at };
  }

  function clock(ms) {
    if (!Number.isFinite(ms)) return '--:--:--';
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map(function (v) { return String(v).padStart(2, '0'); }).join(':');
  }

  function mini(ms) {
    if (!Number.isFinite(ms)) return '--';
    if (ms <= 0) return 'NOW';
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return h + 'h' + String(m).padStart(2, '0');
    if (m >= 10) return m + 'm';
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function age(at) {
    if (!at) return 'never';
    const sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
    if (sec < 60) return sec + 's ago';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    return Math.floor(sec / 3600) + 'h ago';
  }

  function flow(at) {
    at = Number(at || Date.now());
    const p = state.progress;
    const drugMs = drugRemaining(at);

    if (!state.configured) {
      return { stage: 'setup', item: 'setup', title: 'Set up your jump', text: 'Enter how many Xanax and DVDs you have already used.', ms: null, warn: 0 };
    }
    if (p.complete) {
      return { stage: 'complete', item: 'done', title: 'Happy jump complete', text: 'Reset when you are ready to start another jump.', ms: null, warn: 0 };
    }
    if (p.ecstasy) {
      const deadline = state.trainDeadlineAt || nextQuarter(at);
      return { stage: 'train', item: 'ecstasy', title: 'TRAIN NOW', text: 'Spend the stacked energy in the gym before the next happiness reset.', ms: Math.max(0, deadline - at), warn: TRAIN_WARN_MS };
    }

    if (p.edvd > 0) {
      if (p.edvd < EDVD_TOTAL) {
        return { stage: 'take-edvd', item: 'edvd', title: 'Use Erotic DVD #' + (p.edvd + 1), text: 'Use it manually, then acknowledge it here. Continue quickly through all 5.', ms: 0, warn: 60000 };
      }
      return { stage: 'take-ecstasy', item: 'ecstasy', title: 'Take Ecstasy now', text: 'All 5 DVDs are logged. Take Ecstasy manually, then acknowledge it here.', ms: 0, warn: 60000 };
    }

    if (!apiKey()) {
      return { stage: 'key', item: 'xanax', title: 'API key required', text: 'Save your own minimal-access Torn API key. It stays local to this script.', ms: null, warn: 0 };
    }

    if (p.xanax < XANAX_TOTAL) {
      if (drugMs === null || (drugMs <= 0 && !cooldownFresh(at))) {
        return { stage: 'sync', item: 'xanax', title: 'Check Xanax #' + (p.xanax + 1), text: 'Sync Torn cooldown before taking the next Xanax.', ms: null, warn: 0 };
      }
      if (drugMs > 0) {
        return { stage: 'wait-xanax', item: 'xanax', title: 'Xanax ' + p.xanax + '/' + XANAX_TOTAL + ' logged', text: 'Wait for drug cooldown. Next: Xanax #' + (p.xanax + 1) + '.', ms: drugMs, warn: DRUG_WARN_MS };
      }
      return { stage: 'take-xanax', item: 'xanax', title: 'Take Xanax #' + (p.xanax + 1), text: 'Take it manually in Torn, then acknowledge it here.', ms: 0, warn: DRUG_WARN_MS };
    }

    if (drugMs === null || (drugMs <= 0 && !cooldownFresh(at))) {
      return { stage: 'sync', item: 'xanax', title: 'Confirm final cooldown', text: 'Sync Torn cooldown before starting the DVD stage.', ms: null, warn: 0 };
    }
    if (drugMs > 0) {
      return { stage: 'wait-final', item: 'xanax', title: '4/4 Xanax complete', text: 'Wait for the final drug cooldown to clear. Do not take Ecstasy yet.', ms: drugMs, warn: DRUG_WARN_MS };
    }

    const q = quarterGate(at);
    if (!q.ready) {
      return { stage: 'wait-quarter', item: 'edvd', title: 'Xanax stack ready', text: 'For timing safety, start the DVD chain just after the next :00 / :15 / :30 / :45 happiness reset.', ms: q.ms, warn: 60000 };
    }
    return { stage: 'take-edvd', item: 'edvd', title: 'Use Erotic DVD #1', text: 'Use it manually, then acknowledge it here. Continue quickly through all 5.', ms: 0, warn: 60000 };
  }

  function icon(item) {
    if (item === 'edvd') {
      return '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    }
    if (item === 'ecstasy') {
      return '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 10h8M10 14h6M10 18h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }
    if (item === 'done') {
      return '<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="m9 14 3 3 7-8" fill="none" stroke="currentColor" stroke-width="2.3"/></svg>';
    }
    if (item === 'setup') {
      return '<svg viewBox="0 0 28 28"><path d="M14 5v18M5 14h18" stroke="currentColor" stroke-width="2"/></svg>';
    }
    return '<svg viewBox="0 0 28 28"><g transform="rotate(-35 14 14)"><rect x="7" y="10" width="14" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 10v8" stroke="currentColor" stroke-width="1.7"/></g></svg>';
  }

  function launcherMarkup(f) {
    return '<span class="mmhj-inner"><span class="mmhj-icon">' + icon(f.item) + '</span><span class="mmhj-time">' + mini(f.ms) + '</span></span>';
  }

  function installLauncherStyle() {
    if (document.getElementById('mmhj-launcher-style')) return;
    const style = document.createElement('style');
    style.id = 'mmhj-launcher-style';
    style.textContent =
      '[data-mm-dock-id="happy-jump"] .mmhj-inner{position:relative;width:100%;height:100%;display:block;pointer-events:none}' +
      '[data-mm-dock-id="happy-jump"] .mmhj-icon{position:absolute;left:50%;top:1px;transform:translateX(-50%);width:24px;height:24px}' +
      '[data-mm-dock-id="happy-jump"] .mmhj-icon svg{width:24px!important;height:24px!important}' +
      '[data-mm-dock-id="happy-jump"] .mmhj-time{position:absolute;left:1px;right:1px;bottom:2px;text-align:center;font:700 8px/10px ui-monospace,monospace;color:#eef}' +
      '[data-mm-dock-id="happy-jump"].mmhj-soon{box-shadow:inset 0 0 0 2px #a93d3d,0 0 8px #b63838!important}' +
      '[data-mm-dock-id="happy-jump"].mmhj-zero{animation:mmhj-pulse 1.25s ease-in-out infinite!important}' +
      '@keyframes mmhj-pulse{0%,100%{box-shadow:inset 0 0 0 1px #873838,0 0 4px #7b2d2d}50%{box-shadow:inset 0 0 0 2px #d55b5b,0 0 11px #c74646}}';
    document.head.append(style);
  }

  function makeUI() {
    const host = document.createElement('div');
    host.id = 'mm-happy-jump-root';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      ':host{all:initial}*,*:before,*:after{box-sizing:border-box}' +
      '#panel{position:fixed;right:12px;top:82px;z-index:2147483646;width:min(360px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;border:1px solid #3b3b3b;border-radius:9px;background:#141414;color:#e8e8e8;box-shadow:0 7px 24px #000a;font:12px/1.4 Arial,sans-serif}' +
      '#panel[hidden]{display:none!important}#header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:1px solid #333;background:#1d1d1d;user-select:none}#header b{flex:1;font-size:13px}main{padding:10px}' +
      '.card{border:1px solid #353535;background:#1a1a1a;border-radius:8px;padding:9px;margin-bottom:8px}.next{border-color:#51452b;background:#211d15}.head{display:flex;gap:9px;align-items:center}.icon{width:36px;height:36px;display:grid;place-items:center;color:#e5c875}.icon svg{width:32px;height:32px}.title{font-weight:700;font-size:14px}.muted{color:#999;font-size:11px}.timer{font:800 28px/1.1 ui-monospace,monospace;margin:8px 0 5px}.timer.soon{color:#ff8585}.timer.zero{color:#ffb1b1;text-shadow:0 0 8px #9a3333}' +
      '.progress{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}.progress div{border:1px solid #333;border-radius:6px;background:#111;padding:6px;text-align:center}.progress b{display:block}.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px}button{border:1px solid #555;background:#272727;color:#eee;border-radius:6px;padding:7px 9px;cursor:pointer;font:12px Arial,sans-serif}button.primary{border-color:#9a7b35;background:#4b3b18}button.danger{border-color:#794242;background:#3b1f1f}button:disabled{opacity:.45;cursor:not-allowed}input{width:100%;border:1px solid #444;background:#101010;color:#eee;border-radius:5px;padding:7px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}label{display:block;margin:7px 0 3px;color:#bdbdbd}.check{display:flex;gap:7px;align-items:center;margin-top:27px}.check input{width:auto}.notice{min-height:16px;color:#e4c27a;margin-top:6px}.api{display:flex;gap:6px}.api input{flex:1}.foot{color:#777;font-size:10px;margin-top:8px}' +
      '@media(max-width:520px){#panel{right:8px;top:56px;width:calc(100vw - 16px);max-height:calc(100vh - 64px)}.grid{grid-template-columns:1fr}.check{margin-top:5px}}';

    const panel = document.createElement('section');
    panel.id = 'panel';
    panel.hidden = true;
    panel.innerHTML =
      '<header id="header"><b>MM Happy Jump</b><span class="muted">v' + VERSION + '</span><button id="sync" type="button">Sync</button><button id="min" type="button">-</button></header>' +
      '<main>' +
      '<div class="card next"><div class="head"><div class="icon" id="itemicon"></div><div><div class="title" id="title">Loading...</div><div class="muted" id="stage"></div></div></div><div class="timer" id="timer">--:--:--</div><div id="text"></div><div class="notice" id="notice"></div><div class="row"><button class="primary" id="action" type="button">Continue</button></div></div>' +
      '<div class="progress"><div><span class="muted">Xanax</span><b id="xp">0/4</b></div><div><span class="muted">eDVD</span><b id="dp">0/5</b></div><div><span class="muted">Ecstasy</span><b id="ep">No</b></div></div>' +
      '<div class="card" id="setup"><div class="title">Full Happy Jump</div><div class="muted">4 Xanax -> final drug cooldown -> 5 Erotic DVDs -> Ecstasy -> train.</div><div class="grid"><div><label>Xanax taken</label><input id="x" type="number" min="0" max="4" step="1"></div><div><label>eDVD used</label><input id="d" type="number" min="0" max="5" step="1"></div><label class="check"><input id="e" type="checkbox"> Ecstasy taken</label></div><div class="row"><button class="primary" id="start" type="button">Start / Resume</button></div></div>' +
      '<div class="card"><div class="title">Torn cooldown</div><div id="cd">Not synced.</div><div class="muted" id="fresh">Official Torn API. Local fetch time is shown; source timestamp is unavailable.</div><label>Minimal-access Torn API key</label><div class="api"><input id="apikey" type="password" autocomplete="off" spellcheck="false" placeholder="Stored only in this script"><button id="savekey" type="button">Save</button></div><div class="muted" id="keystatus"></div></div>' +
      '<div class="row"><button id="edit" type="button">Edit Progress</button><button id="reset" class="danger" type="button">Reset Jump</button></div><div class="foot">Manual acknowledgements only. This script never takes drugs, uses boosters, or trains for you.</div>' +
      '</main>';

    shadow.append(style, panel);
    document.body.append(host);
    return { host: host, shadow: shadow, panel: panel, el: function (id) { return shadow.getElementById(id); } };
  }

  function notice(message) {
    if (ui) ui.el('notice').textContent = String(message || '');
  }

  function timerClass(f) {
    if (!Number.isFinite(f.ms)) return '';
    if (f.ms <= 0) return 'zero';
    return f.warn && f.ms <= f.warn ? 'soon' : '';
  }

  function render() {
    if (destroyed || !ui || !state) return;

    const f = flow();
    const cls = timerClass(f);

    ui.el('itemicon').innerHTML = icon(f.item);
    ui.el('title').textContent = f.title;
    ui.el('stage').textContent = f.stage.toUpperCase().replaceAll('-', ' ');
    ui.el('timer').textContent = Number.isFinite(f.ms) ? clock(f.ms) : '--:--:--';
    ui.el('timer').className = 'timer' + (cls ? ' ' + cls : '');
    ui.el('text').textContent = f.text;
    ui.el('xp').textContent = state.progress.xanax + '/' + XANAX_TOTAL;
    ui.el('dp').textContent = state.progress.edvd + '/' + EDVD_TOTAL;
    ui.el('ep').textContent = state.progress.ecstasy ? 'Yes' : 'No';
    ui.el('setup').hidden = state.configured && ui.el('setup').dataset.edit !== '1';

    const action = ui.el('action');
    action.dataset.action = f.stage;
    action.disabled = false;
    if (f.stage === 'setup') action.textContent = 'Complete setup below';
    else if (f.stage === 'key') action.textContent = 'Save API key below';
    else if (f.stage === 'sync') action.textContent = 'Sync cooldown';
    else if (f.stage === 'take-xanax') action.textContent = 'I took Xanax #' + (state.progress.xanax + 1);
    else if (f.stage === 'take-edvd') action.textContent = 'I used eDVD #' + (state.progress.edvd + 1);
    else if (f.stage === 'take-ecstasy') action.textContent = 'I took Ecstasy';
    else if (f.stage === 'train') action.textContent = 'Jump complete';
    else action.textContent = f.stage === 'complete' ? 'Complete' : 'Waiting';
    if (['wait-xanax', 'wait-final', 'wait-quarter', 'complete'].includes(f.stage)) action.disabled = true;

    ui.el('cd').textContent = 'Drug ' + clock(drugRemaining()) + ' · Booster ' + clock(boosterRemaining());
    if (state.cooldown.fetchedAt) {
      ui.el('fresh').textContent = 'Torn API fetched ' + age(state.cooldown.fetchedAt) +
        (state.cooldown.status === 'fresh' ? '' : ' · ' + state.cooldown.status.toUpperCase()) +
        (state.cooldown.error ? ' · ' + state.cooldown.error : '') +
        '. Source timestamp unavailable.';
    } else {
      ui.el('fresh').textContent = 'Torn API has not been fetched yet. Source timestamp unavailable.';
    }
    ui.el('keystatus').textContent = apiKey() ? 'API key saved locally for this script.' : 'No API key saved.';

    launcher.innerHTML = launcherMarkup(f);
    launcher.classList.toggle('mmhj-soon', cls === 'soon');
    launcher.classList.toggle('mmhj-zero', cls === 'zero');
    launcher.title = 'MM Happy Jump · ' + f.title + (Number.isFinite(f.ms) ? ' · ' + clock(f.ms) : '');
    launcher.setAttribute('aria-label', launcher.title);
    if (typeof core.setDockLauncherActive === 'function') core.setDockLauncherActive(MODULE_ID, state.configured && f.stage !== 'complete');

    if (state.configured && apiKey() && f.stage === 'sync' &&
        Date.now() - lastZeroSyncAt > API_FRESH_MS &&
        document.visibilityState === 'visible' && document.hasFocus()) {
      lastZeroSyncAt = Date.now();
      void syncCooldown(true);
    }
  }

  function requestJson(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        timeout: API_TIMEOUT_MS,
        headers: { Accept: 'application/json' },
        onload: function (response) {
          if (response.status < 200 || response.status >= 300) return reject(new Error('HTTP ' + response.status));
          let data;
          try { data = JSON.parse(response.responseText); }
          catch (_) { return reject(new Error('Torn API returned invalid JSON.')); }
          if (data && data.error) {
            return reject(new Error(String(data.error.error || data.error.message || data.error).slice(0, 180)));
          }
          resolve(data);
        },
        ontimeout: function () { reject(new Error('Torn API request timed out.')); },
        onerror: function () { reject(new Error('Torn API network request failed.')); }
      });
    });
  }

  async function syncCooldown(silent) {
    silent = silent === true;
    if (syncing || destroyed) return false;

    const key = apiKey();
    if (!key) {
      if (!silent) notice('Save a minimal-access Torn API key first.');
      return false;
    }

    syncing = true;
    if (!silent) notice('Syncing Torn cooldown...');
    try {
      const url = new URL('https://api.torn.com/v2/user/cooldowns');
      url.searchParams.set('key', key);
      url.searchParams.set('comment', 'MM_Happy_Jump');
      const data = await requestJson(url.toString());
      const drug = whole(data && data.cooldowns && data.cooldowns.drug, 0, 172800);
      const booster = whole(data && data.cooldowns && data.cooldowns.booster, 0, 604800);
      if (drug === null || booster === null) throw new Error('Cooldown response failed validation.');

      change(function (draft) {
        draft.cooldown = { drug: drug, booster: booster, fetchedAt: Date.now(), status: 'fresh', error: '' };
      });
      if (!silent) notice('Cooldown synced from Torn.');
      render();
      return true;
    } catch (error) {
      change(function (draft) {
        draft.cooldown.status = draft.cooldown.fetchedAt ? 'stale' : 'error';
        draft.cooldown.error = String(error && error.message || error || 'Cooldown sync failed.').slice(0, 220);
      });
      if (!silent) notice(state.cooldown.error);
      render();
      return false;
    } finally {
      syncing = false;
    }
  }

  function scheduleAfterDrug() {
    if (postDrugTimer) clearTimeout(postDrugTimer);
    postDrugTimer = setTimeout(async function () {
      postDrugTimer = null;
      const ok = await syncCooldown(false);
      if (ok && (drugRemaining() || 0) <= 0) {
        postDrugTimer = setTimeout(function () {
          postDrugTimer = null;
          if (!destroyed) void syncCooldown(true);
        }, 12000);
      }
    }, 2000);
  }

  function fillInputs() {
    ui.el('x').value = String(state.progress.xanax);
    ui.el('d').value = String(state.progress.edvd);
    ui.el('e').checked = state.progress.ecstasy;
  }

  function saveProgress(event) {
    if (!event || !event.isTrusted) return;

    const xanax = whole(ui.el('x').value, 0, XANAX_TOTAL);
    const edvd = whole(ui.el('d').value, 0, EDVD_TOTAL);
    const ecstasy = ui.el('e').checked;

    if (xanax === null || edvd === null) return notice('Progress must use whole numbers within the recipe limits.');
    if (edvd > 0 && xanax !== XANAX_TOTAL) return notice('DVD progress can only start after all 4 Xanax.');
    if (ecstasy && (xanax !== XANAX_TOTAL || edvd !== EDVD_TOTAL)) return notice('Ecstasy can only be marked after 4 Xanax and 5 DVDs.');

    change(function (draft) {
      draft.configured = true;
      draft.progress = { xanax: xanax, edvd: edvd, ecstasy: ecstasy, complete: false };
      draft.trainDeadlineAt = ecstasy ? nextQuarter() : 0;
      draft.lastActionAt = Date.now();
    });

    ui.el('setup').dataset.edit = '';
    notice('Jump progress saved.');
    render();
    if (apiKey()) void syncCooldown(true);
  }

  function handleAction(event) {
    if (!event || !event.isTrusted || syncing) return;

    const type = ui.el('action').dataset.action;
    if (type === 'setup') return ui.el('setup').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (type === 'key') return ui.el('apikey').focus();
    if (type === 'sync') return void syncCooldown(false);

    if (type === 'take-xanax') {
      change(function (draft) {
        if (draft.progress.xanax < XANAX_TOTAL) draft.progress.xanax += 1;
        draft.cooldown.status = 'stale';
        draft.cooldown.error = 'Waiting for Torn to confirm the new drug cooldown.';
        draft.lastActionAt = Date.now();
      });
      notice('Xanax #' + state.progress.xanax + ' acknowledged. Confirming cooldown...');
      render();
      scheduleAfterDrug();
      return;
    }

    if (type === 'take-edvd') {
      change(function (draft) {
        if (draft.progress.edvd < EDVD_TOTAL) draft.progress.edvd += 1;
        draft.lastActionAt = Date.now();
      });
      notice('Erotic DVD #' + state.progress.edvd + ' acknowledged.');
      render();
      return;
    }

    if (type === 'take-ecstasy') {
      change(function (draft) {
        draft.progress.ecstasy = true;
        draft.trainDeadlineAt = nextQuarter();
        draft.lastActionAt = Date.now();
      });
      notice('Ecstasy acknowledged. Train now.');
      render();
      return;
    }

    if (type === 'train') {
      change(function (draft) {
        draft.progress.complete = true;
        draft.lastActionAt = Date.now();
      });
      notice('Jump marked complete.');
      render();
    }
  }

  function bind() {
    ui.el('min').addEventListener('click', function (event) {
      if (!event.isTrusted) return;
      ui.panel.hidden = true;
      launcher.focus();
    });

    ui.el('sync').addEventListener('click', function (event) {
      if (event.isTrusted) void syncCooldown(false);
    });

    ui.el('action').addEventListener('click', handleAction);
    ui.el('start').addEventListener('click', saveProgress);

    ui.el('edit').addEventListener('click', function (event) {
      if (!event.isTrusted) return;
      fillInputs();
      ui.el('setup').dataset.edit = '1';
      ui.el('setup').hidden = false;
    });

    ui.el('savekey').addEventListener('click', function (event) {
      if (!event.isTrusted) return;
      const key = String(ui.el('apikey').value || '').trim();
      if (!validKey(key)) return notice('Enter a valid Torn API key with no spaces.');
      GM_setValue(API_KEY, key);
      ui.el('apikey').value = '';
      notice('API key saved locally.');
      render();
      void syncCooldown(false);
    });

    ui.el('reset').addEventListener('click', function (event) {
      if (!event.isTrusted || !window.confirm('Reset Happy Jump progress? Your API key will be kept.')) return;
      const next = blankState();
      next.cooldown = clone(state.cooldown);
      save(next);
      fillInputs();
      notice('Jump progress reset.');
      render();
    });

    ui.panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        ui.panel.hidden = true;
        launcher.focus();
      }
    });
  }

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    if (ticker) clearInterval(ticker);
    if (postDrugTimer) clearTimeout(postDrugTimer);
    if (typeof ui?.panel?.__mmPanelDragCleanup === 'function') ui.panel.__mmPanelDragCleanup();
    if (valueListener !== null && typeof GM_removeValueChangeListener === 'function') GM_removeValueChangeListener(valueListener);
    if (launcher && launcher.isConnected) launcher.remove();
    if (ui && ui.host) ui.host.remove();
  }

  async function boot() {
    if (!core || typeof core.registerDockLauncher !== 'function' || typeof core.makePanelDraggable !== 'function') {
      throw new Error('Shared MM Torn Core dependency is unavailable.');
    }

    state = loadState();
    ui = makeUI();
    installLauncherStyle();

    launcher = core.registerDockLauncher({
      id: MODULE_ID,
      label: 'MM Happy Jump',
      accent: '#8b4d61',
      icon: launcherMarkup(flow()),
      onClick: function (event) {
        if (!event || !event.isTrusted || destroyed) return;
        ui.panel.hidden = !ui.panel.hidden;
        if (!ui.panel.hidden) {
          fillInputs();
          render();
          if (apiKey() && (!state.cooldown.fetchedAt || Date.now() - state.cooldown.fetchedAt > API_FRESH_MS)) {
            void syncCooldown(true);
          }
        }
      }
    });

    if (!(launcher instanceof HTMLElement)) throw new Error('Shared MM dock launcher could not be registered.');
    core.makePanelDraggable(ui.panel, ui.el('header'), MODULE_ID, { right: '12px', top: '82px' });

    bind();
    fillInputs();

    valueListener = GM_addValueChangeListener(STATE_KEY, function (_key, _old, next, remote) {
      if (!remote || destroyed) return;
      try {
        const incoming = normalize(next);
        if (incoming.revision >= state.revision) {
          state = incoming;
          render();
        }
      } catch (_) {}
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || destroyed) return;
      try {
        const latest = normalize(GM_getValue(STATE_KEY, state));
        if (latest.revision >= state.revision) state = latest;
      } catch (_) {}
      render();
      if (apiKey() && (!state.cooldown.fetchedAt || Date.now() - state.cooldown.fetchedAt > API_FRESH_MS)) {
        void syncCooldown(true);
      }
    });

    window.addEventListener('focus', function () {
      if (destroyed) return;
      render();
      if (apiKey() && (!state.cooldown.fetchedAt || Date.now() - state.cooldown.fetchedAt > API_FRESH_MS)) {
        void syncCooldown(true);
      }
    });

    ticker = window.setInterval(render, 1000);
    if (apiKey() && state.configured) void syncCooldown(true);
    render();
  }

  if (window.top === window.self) {
    void boot().catch(function (error) {
      const note = document.createElement('div');
      note.textContent = 'MM Happy Jump could not start: ' + String(error && error.message || error);
      note.style.cssText = 'position:fixed;top:4px;left:4px;z-index:2147483647;background:#321d22;color:#ffd4dc;padding:8px;border:1px solid #744;font:12px Arial,sans-serif';
      document.body.append(note);
    });
    window.addEventListener('pagehide', cleanup, { once: true });
  }
})();