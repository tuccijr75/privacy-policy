#!/usr/bin/env python3
"""Build the self-contained TornPDA distribution for MM_Acquisitions.

TornPDA does not currently load Tampermonkey @require dependencies reliably.
The PDA artifact therefore bundles the canonical source modules in dependency
order and injects only a thin PDA platform/storage adapter.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORE = HERE.parent / "core" / "MM_Torn_Core.js"
ADAPTER = HERE / "MM_Acquisitions.pda.adapter.js"
LOGIC = HERE / "MM_Acquisitions.logic.js"
LIVE = HERE / "MM_Acquisitions.live.js"
RANKED = HERE / "MM_Acquisitions.ranked.logic.js"
PURCHASE = HERE / "MM_Acquisitions.purchase.logic.js"
MAIN = HERE / "MM_Acquisitions.user.js"
DEFAULT_OUTPUT = HERE / "MM_Acquisitions.pda.user.js"

SECTIONS = [
    ("MM Torn Core (bundled)", CORE),
    ("TornPDA platform/state adapter", ADAPTER),
    ("Acquisitions logic (bundled)", LOGIC),
    ("Acquisitions live service (bundled)", LIVE),
    ("Ranked profit logic (bundled)", RANKED),
    ("Purchase ledger logic (bundled)", PURCHASE),
]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main_body(source: str) -> str:
    marker = "(() => {"
    start = source.find(marker)
    if start < 0:
        raise RuntimeError("MM_Acquisitions.user.js main IIFE was not found")
    return source[start:]


def source_version(source: str) -> str:
    match = re.search(r"^//\s*@version\s+([^\s]+)", source, re.MULTILINE)
    if not match:
        raise RuntimeError("MM_Acquisitions.user.js @version was not found")
    return match.group(1)


def metadata(version: str) -> str:
    return f"""// ==UserScript==
// @name         MM_Acquisitions PDA
// @namespace    manic-mike.torn.acquisitions.pda
// @version      {version}
// @description  TornPDA-compatible bundled MM Acquisitions build. Profit, ranked weapons, travel procurement, manual final purchase.
// @match        https://www.torn.com/*
// @match        https://weav3r.dev/travel-stock*
// @match        https://www.weav3r.dev/travel-stock*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// @connect      weav3r.dev
// ==/UserScript==

"""


def build(pda_revision: int) -> str:
    main_source = read(MAIN)
    base_version = source_version(main_source)
    pda_version = f"{base_version}-pda.{pda_revision}"

    boot = r"""
(() => {
  'use strict';
  globalThis.__MM_ACQ_PDA_STAGE='boot';
  function ensureBootLauncher(){
    if(!document.body)return;
    let b=document.getElementById('mm-acquisitions-launcher');
    if(!b){
      b=document.createElement('button');
      b.id='mm-acquisitions-launcher';
      b.type='button';
      b.setAttribute('aria-label','MM_Acquisitions');
      b.title='MM_Acquisitions';
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" style="width:22px;height:22px;display:block;"><circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m15 15 4 4M9 7.5v6M6.8 9.2h4.4M6.8 11.8h4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      b.style.cssText='position:fixed;right:10px;bottom:86px;z-index:2147483647;width:42px;height:42px;min-width:42px;min-height:42px;padding:0;margin:0;border:1px solid #25282b;border-bottom-color:#111;border-radius:3px;background:linear-gradient(180deg,#5e8d72 0%,#3f6551 58%,#242424 100%);box-shadow:inset 0 1px 0 #ffffff24,inset 0 -1px 0 #0009,0 1px 3px #0009;color:#d7e2e7;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      b.addEventListener('click',()=>{
        if(typeof globalThis.__MM_ACQ_OPEN__==='function'){
          globalThis.__MM_ACQ_OPEN__();
          return;
        }
        const stage=String(globalThis.__MM_ACQ_PDA_STAGE||'unknown');
        let d=document.getElementById('mm-acq-pda-boot-diagnostic');
        if(!d){
          d=document.createElement('div');
          d.id='mm-acq-pda-boot-diagnostic';
          d.style.cssText='position:fixed;left:12px;right:12px;top:80px;z-index:2147483647;padding:12px;border:1px solid #9a7b35;border-radius:8px;background:#111;color:#eee;font:13px/1.4 Arial,sans-serif;box-shadow:0 10px 30px #000b;';
          document.body.appendChild(d);
        }
        d.innerHTML='<b>MM_Acquisitions PDA boot diagnostic</b><div style="margin-top:6px;">Stopped at: <code>'+stage.replace(/[<>&]/g,'')+'</code></div><div style="margin-top:4px;color:#bbb;">Send a screenshot of this message.</div>';
      });
      document.body.appendChild(b);
    }
  }
  if(document.body)ensureBootLauncher();
  else window.addEventListener('DOMContentLoaded',ensureBootLauncher,{once:true});
})();
"""
    pieces = [metadata(pda_version), boot]

    stage_names = [
        "core",
        "adapter",
        "logic",
        "live",
        "ranked",
        "ledger",
    ]
    for (stage, (title, path)) in zip(stage_names, SECTIONS):
        pieces.append(f"\n/* ===== {title} ===== */\n")
        pieces.append(read(path))
        pieces.append(f"\n;globalThis.__MM_ACQ_PDA_STAGE='{stage}';\n")

    body = main_body(main_source)
    body = body.replace(
        f"v{base_version} · PROFIT / RANKED / TRAVEL",
        f"v{pda_version} · PROFIT / RANKED / TRAVEL",
    )

    # TornPDA's browser chrome sits over the bottom of the webview. The shared
    # desktop dock intentionally targets Torn's own footer row and can therefore
    # place a correctly-created launcher underneath PDA's native bottom bar.
    # Use the already-proven standalone launcher path on PDA and lift it above
    # the native chrome; desktop builds keep the shared Core dock unchanged.
    body = body.replace(
        "if(core?.registerDockLauncher){",
        "if(core?.registerDockLauncher&&!globalThis.__MM_TORN_PDA__){",
    )
    body = body.replace(
        "position:fixed;right:52px;bottom:6px;",
        "position:fixed;right:10px;bottom:86px;",
    )
    body = body.replace(
        "const apiKey=()=>String(GM_getValue(API_KEY,'')||'').trim();",
        "const apiKey=()=>{const saved=String(GM_getValue(API_KEY,'')||'').trim();if(saved)return saved;const pda=String(globalThis.__MM_PDA_API_KEY__||'').trim();const unresolved='###PDA-'+'APIKEY###';return pda&&pda!==unresolved?pda:'';};",
    )

    body = body.replace(
        "function initializeAcquisitions(){createLauncher();installChannel();}",
        "globalThis.__MM_ACQ_OPEN__=open;globalThis.__MM_ACQ_PDA_STAGE='ui-ready';function initializeAcquisitions(){createLauncher();installChannel();}",
    )
    pieces.append("\n/* ===== Acquisitions UI ===== */\n")
    pieces.append(body)

    output = "\n".join(pieces)
    header_end = output.find("// ==/UserScript==")
    if "@require" in output[:header_end]:
        raise RuntimeError("PDA metadata must not contain @require")
    for required in (
        "MMTornCore",
        "MMTornAcquisitionsLogic",
        "MMTornAcquisitionsLive",
        "MMTornRankedProfitLogic",
        "MMTornAcquisitionLedger",
        "PDA_storage",
        "PDA_httpGet",
    ):
        if required not in output:
            raise RuntimeError(f"PDA bundle is missing required token: {required}")
    return output


def cli() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pda-revision", type=int, default=4)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.pda_revision < 1:
        raise SystemExit("--pda-revision must be >= 1")

    output = build(args.pda_revision)
    args.output.write_text(output, encoding="utf-8")
    print(f"Wrote {args.output} ({len(output):,} bytes)")


if __name__ == "__main__":
    cli()
