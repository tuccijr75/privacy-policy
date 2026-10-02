// ==UserScript==
// @name         MM Torn Market Scout
// @namespace    manic-mike.torn.market-scout
// @version      8.0.0-alpha.1
// @description  Read-only v8 Market Scout alpha using cached CRM market/travel state.
// @match        https://www.torn.com/*
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/core/MM_Torn_Core.js
// @require      https://raw.githubusercontent.com/tuccijr75/privacy-policy/crm-v8-modular-suite/modular-suite/market-scout/MM_Market_Scout.logic.js
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const ROOT_ID = 'mm-market-scout';
  const LAUNCHER_ID = 'mm-market-scout-launcher';
  let activeView = 'deals';
  let state = null;
  let loadError = '';

  const core = globalThis.MMTornCore;
  const logic = globalThis.MMTornMarketLogic;

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money = value => '$' + Math.max(0,Number(value)||0).toLocaleString('en-US',{maximumFractionDigits:0});

  function button(primary=false) {
    return 'border:1px solid ' + (primary?'#9a7b35':'#555') + ';background:' + (primary?'#4b3b18':'#232323') + ';color:#eee;border-radius:6px;padding:7px 10px;cursor:pointer;font:12px Arial,sans-serif;';
  }

  function card(html) {
    return '<div style="border:1px solid #353535;background:#171717;border-radius:8px;padding:9px;margin-bottom:7px;">'+html+'</div>';
  }

  function age(value) {
    const ms = Date.parse(value || '');
    if (!ms) return 'not synced';
    const sec = Math.max(0,Math.floor((Date.now()-ms)/1000));
    if (sec < 60) return sec+'s ago';
    if (sec < 3600) return Math.floor(sec/60)+'m ago';
    if (sec < 86400) return Math.floor(sec/3600)+'h ago';
    return Math.floor(sec/86400)+'d ago';
  }

  async function loadCachedState() {
    loadError = '';
    if (!core || !logic) {
      loadError = 'Core or Market Scout logic did not load.';
      state = null;
      render();
      return;
    }
    try {
      const next = await core.readLegacyState();
      const validation = core.validateLegacyState(next);
      if (!validation.ok) throw new Error(validation.errors.join('; '));
      state = next;
    } catch (error) {
      state = null;
      loadError = error?.message || String(error);
    }
    render();
  }

  function sourceStrip() {
    if (!state) return '';
    const f = core.freshnessSnapshot(state);
    return '<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:10px;color:#aaa;margin-bottom:7px;">'+
      '<span>Weav3r '+esc(age(f.weav3rGeneratedAt))+'</span>'+
      '<span>· Item Market '+esc(age(f.itemMarket))+'</span>'+
      '<span>· Travel '+esc(age(f.travel))+'</span>'+
    '</div>';
  }

  function dealsHtml() {
    if (!state) return card('<b>No cached market state available.</b>');
    const rows = logic.rankCachedOpportunities(state);
    const buyable = rows.filter(r=>r.purchaseReady).slice(0,12);
    const research = rows.filter(r=>!r.purchaseReady).slice(0,8);

    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">'+
        '<div><b>Best Cached Opportunities</b><div style="font-size:10px;color:#888;">Same ROI + sell-through + profit-velocity model as v7.5.3. No live verification in this alpha.</div></div>'+
        '<button id="mm-scout-reload" style="'+button()+'">Reload Cache</button>'+
      '</div>'
    )+
    card('<b>Buyable from current cache</b>'+
      (buyable.length ? buyable.map((r,i)=>
        '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #303030;padding:8px 0;font-size:11px;">'+
          '<div style="min-width:0;"><b>#'+(i+1)+' '+esc(r.name)+'</b> · '+esc(r.purchaseSource)+
          '<div>Buy <b>'+money(r.buyPrice)+'</b> · Max '+money(r.maxBuyPrice)+' · Exit '+money(r.bestExit)+' · ROI <b>'+Number(r.roiPct||0).toFixed(1)+'%</b></div>'+
          '<div style="color:#888;">3d sell-through '+Number(r.sellThrough3dPct||0).toFixed(0)+'% · Qty '+Number(r.recommendedQty||1)+' · Est. 3d profit '+money(r.expectedProfit3d||0)+' · Score '+Number(r.score||0).toFixed(0)+'</div></div>'+
          '<button disabled title="Live seller/Item Market verification is the next extraction slice." style="'+button(true)+'opacity:.45;cursor:not-allowed;white-space:nowrap;">Verify & Buy</button>'+
        '</div>'
      ).join('') : '<div style="font-size:11px;color:#888;margin-top:6px;">No cached opportunity currently satisfies the active business rules.</div>')
    )+
    card('<details><summary style="cursor:pointer;font-weight:700;">Research leads ('+research.length+')</summary>'+
      (research.length ? research.map(r=>
        '<div style="border-top:1px solid #303030;padding:6px 0;font-size:10px;"><b>'+esc(r.name)+'</b> · ROI '+Number(r.roiPct||0).toFixed(1)+'% · Sell-through '+Number(r.sellThrough3dPct||0).toFixed(0)+'% · '+esc(r.purchaseSource)+'</div>'
      ).join('') : '<div style="font-size:10px;color:#888;margin-top:6px;">No additional cached leads.</div>')+
    '</details>');
  }

  function travelHtml() {
    if (!state) return card('<b>No cached travel state available.</b>');
    const rows = logic.rankCachedTravel(state).slice(0,20);
    return card(
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">'+
        '<div><b>Cached Travel Opportunities</b><div style="font-size:10px;color:#888;">Acquisition-only view. Live TornW3B/YATA refresh is not enabled yet.</div></div>'+
        '<button id="mm-scout-reload" style="'+button()+'">Reload Cache</button>'+
      '</div>'
    )+
    card(rows.length ? rows.map((r,i)=>
      '<div style="border-top:1px solid #303030;padding:7px 0;font-size:11px;"><b>#'+(i+1)+' '+esc(r.itemName)+'</b> · '+esc(r.country)+
      '<div>Stock '+Number(r.stock||0).toLocaleString()+' · Profit '+money(r.profit||0)+' · Source profit/hr '+money(r.sourceProfitPerHour||0)+'</div></div>'
    ).join('') : '<div style="font-size:11px;color:#888;">No profitable cached travel rows.</div>');
  }

  function createPanel() {
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText = 'display:none;position:fixed;right:12px;top:90px;z-index:2147483646;width:min(680px,calc(100vw - 24px));max-height:calc(100vh - 110px);overflow:hidden;background:#101010;color:#eee;border:1px solid #6b5a2e;border-radius:9px;box-shadow:0 12px 35px #000b;font:13px/1.35 Arial,sans-serif;';
    document.body.appendChild(root);
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.style.display === 'none') return;

    root.innerHTML =
      '<div style="height:48px;background:#151515;border-bottom:1px solid #4b4024;display:flex;align-items:center;justify-content:space-between;padding:0 9px;">'+
        '<div><b style="font-size:15px;">MM Market Scout</b><div style="font-size:10px;color:#888;">v8.0.0-alpha.1 · cached-data alpha</div></div>'+
        '<button id="mm-scout-close" style="'+button()+'">×</button>'+
      '</div>'+
      '<div style="padding:8px;">'+
        '<div style="display:flex;gap:5px;margin-bottom:7px;">'+
          '<button data-scout-view="deals" style="'+button(activeView==='deals')+'">Deals</button>'+
          '<button data-scout-view="travel" style="'+button(activeView==='travel')+'">Travel</button>'+
          '<span style="flex:1"></span>'+
          '<span style="font-size:10px;color:#d7ad4b;align-self:center;">READ ONLY</span>'+
        '</div>'+
        sourceStrip()+
        (loadError ? card('<b style="color:#ffaaaa;">Cannot read legacy CRM state</b><div style="font-size:11px;margin-top:4px;">'+esc(loadError)+'</div>') : '')+
        '<div style="max-height:calc(100vh - 215px);overflow:auto;padding-right:2px;">'+(activeView==='travel'?travelHtml():dealsHtml())+'</div>'+
      '</div>';

    root.querySelector('#mm-scout-close')?.addEventListener('click',close);
    root.querySelectorAll('[data-scout-view]').forEach(b=>b.addEventListener('click',()=>{
      activeView = b.dataset.scoutView || 'deals';
      render();
    }));
    root.querySelectorAll('#mm-scout-reload').forEach(b=>b.addEventListener('click',loadCachedState));
  }

  function open() {
    createPanel();
    const root = document.getElementById(ROOT_ID);
    const launcher = document.getElementById(LAUNCHER_ID);
    root.style.display = 'block';
    if (launcher) launcher.style.display = 'none';
    render();
    loadCachedState();
  }

  function close() {
    const root = document.getElementById(ROOT_ID);
    const launcher = document.getElementById(LAUNCHER_ID);
    if (root) root.style.display = 'none';
    if (launcher) launcher.style.display = 'block';
  }

  function createLauncher() {
    if (!document.body || document.getElementById(LAUNCHER_ID)) return;
    const b = document.createElement('button');
    b.id = LAUNCHER_ID;
    b.textContent = 'Scout';
    b.style.cssText = 'position:fixed;right:0;top:205px;z-index:2147483647;'+button(true)+'border-radius:6px 0 0 6px;';
    b.addEventListener('click',open);
    document.body.appendChild(b);
  }

  if (document.body) createLauncher();
  else window.addEventListener('DOMContentLoaded',createLauncher,{once:true});
})();
