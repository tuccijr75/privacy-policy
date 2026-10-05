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

    pieces = [metadata(pda_version)]
    for title, path in SECTIONS:
        pieces.append(f"\n/* ===== {title} ===== */\n")
        pieces.append(read(path))

    body = main_body(main_source)
    body = body.replace(
        f"v{base_version} · PROFIT / RANKED / TRAVEL",
        f"v{pda_version} · PROFIT / RANKED / TRAVEL",
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
    parser.add_argument("--pda-revision", type=int, default=1)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.pda_revision < 1:
        raise SystemExit("--pda-revision must be >= 1")

    output = build(args.pda_revision)
    args.output.write_text(output, encoding="utf-8")
    print(f"Wrote {args.output} ({len(output):,} bytes)")


if __name__ == "__main__":
    cli()
