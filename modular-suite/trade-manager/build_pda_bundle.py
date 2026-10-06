#!/usr/bin/env python3
"""Build the self-contained TornPDA distribution for MM Trade Manager."""
from __future__ import annotations

import argparse
import re
from pathlib import Path

HERE=Path(__file__).resolve().parent
CORE=HERE/"vendor"/"MM_Torn_Core.b6d2202.js"
ADAPTER=HERE/"MM_Trade_Manager.pda.adapter.js"
INVENTORY=HERE/"vendor"/"MM_Inventory_ROI.logic.bb32ea3.js"
LOGIC=HERE/"MM_Trade_Manager.logic.js"
MAIN=HERE/"MM_Trade_Manager.user.js"
DEFAULT_OUTPUT=HERE/"MM_Trade_Manager.pda.user.js"

SECTIONS=[
    ("MM Torn Core (bundled)",CORE),
    ("TornPDA platform/state adapter",ADAPTER),
    ("Inventory FIFO logic (bundled)",INVENTORY),
    ("Trade Manager logic (bundled)",LOGIC),
]

def read(path:Path)->str:
    return path.read_text(encoding="utf-8")

def main_body(source:str)->str:
    marker="(() => {"
    start=source.find(marker)
    if start<0:
        raise RuntimeError("MM_Trade_Manager.user.js main IIFE was not found")
    return source[start:]

def source_version(source:str)->str:
    match=re.search(r"^//\s*@version\s+([^\s]+)",source,re.MULTILINE)
    if not match:
        raise RuntimeError("MM_Trade_Manager.user.js @version was not found")
    return match.group(1)

def replace_once(text:str,old:str,new:str,label:str)->str:
    if old not in text:
        raise RuntimeError(f"PDA transform anchor missing: {label}")
    return text.replace(old,new,1)

def metadata(version:str)->str:
    return f"""// ==UserScript==
// @name         MM Trade Manager PDA
// @namespace    manic-mike.torn.trade-manager.pda
// @version      {version}
// @description  TornPDA API-confirmed trade valuation, completed-trade history and Inventory reconciliation; final trade actions remain manual.
// @match        https://www.torn.com/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      api.torn.com
// ==/UserScript==

"""

def build(pda_revision:int)->str:
    main_source=read(MAIN)
    base_version=source_version(main_source)
    pda_version=f"{base_version}-pda.{pda_revision}"
    pda_key="const __MM_TRADE_PDA_API_KEY='###PDA-APIKEY###';\n"
    pieces=[metadata(pda_version),pda_key]

    for title,path in SECTIONS:
        pieces.append(f"\n/* ===== {title} ===== */\n")
        pieces.append(read(path))

    body=main_body(main_source)
    body=replace_once(body,f"const VERSION='{base_version}';",f"const VERSION='{pda_version}';","runtime version")
    body=replace_once(
        body,
        "  function apiKey(){return String(GM_getValue(API_KEY,'')||'').trim();}",
        "  function apiKey(){const saved=String(GM_getValue(API_KEY,'')||'').trim();if(saved)return saved;const pda=String(__MM_TRADE_PDA_API_KEY||'').trim();const unresolved='###PDA-'+'APIKEY###';return pda&&pda!==unresolved?pda:'';}",
        "PDA lexical API key fallback",
    )
    pieces.append("\n/* ===== Trade Manager UI ===== */\n")
    pieces.append(body)

    output="\n".join(pieces)
    header_end=output.find("// ==/UserScript==")
    if "@require" in output[:header_end]:
        raise RuntimeError("PDA metadata must not contain @require")
    for required in ("MMTornCore","MMTornInventoryRoiLogic","MMTornTradeManagerLogic","PDA_storage","PDA_httpGet","__MM_TRADE_PDA_API_KEY"):
        if required not in output:
            raise RuntimeError(f"PDA bundle is missing required token: {required}")
    return output

def cli()->None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--pda-revision",type=int,default=2)
    parser.add_argument("--output",type=Path,default=DEFAULT_OUTPUT)
    args=parser.parse_args()
    if args.pda_revision<1:
        raise SystemExit("--pda-revision must be >= 1")
    output=build(args.pda_revision)
    args.output.write_text(output,encoding="utf-8")
    print(f"Wrote {args.output} ({len(output):,} bytes)")

if __name__=="__main__":
    cli()
