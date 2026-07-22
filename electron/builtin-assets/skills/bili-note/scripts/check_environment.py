#!/usr/bin/env python3
"""Check the lightweight Bili Note opus/comment helper environment."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any, Callable


SCRIPT_DIR = Path(__file__).resolve().parent
REQUIRED_SCRIPTS = [
    "extract_bilibili.py",
    "extract_bilibili_opus.py",
    "run_bili_note.py",
    "archive_bili_materials.py",
    "score_bili_note.py",
]


def scripts_status(script_dir: Path = SCRIPT_DIR) -> dict[str, Any]:
    files = {name: (script_dir / name).exists() for name in REQUIRED_SCRIPTS}
    return {"ok": all(files.values()), "files": files}


def check_bilibili_api(
    api_url: str = "https://api.bilibili.com/x/web-interface/nav",
    timeout: float = 1.5,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> dict[str, Any]:
    request = urllib.request.Request(
        api_url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
    )
    try:
        with opener(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return {"ok": payload.get("code") == 0, "code": payload.get("code"), "url": api_url}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "url": api_url}


def evaluate_environment(
    *,
    script_dir: Path = SCRIPT_DIR,
    api_url: str = "https://api.bilibili.com/x/web-interface/nav",
    timeout: float = 1.5,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> dict[str, Any]:
    scripts = scripts_status(script_dir)
    api = check_bilibili_api(api_url, timeout, opener)
    core_ok = bool(scripts["ok"] and api["ok"])
    return {
        "python": {"ok": True, "executable": sys.executable, "version": sys.version.split()[0]},
        "scripts": scripts,
        "bilibili_api": api,
        "capabilities": {
            "parsed_video_media_read": {
                "ok": True,
                "note": "Provided by MindSpace runtime; requires an authorized parsed mediaId.",
            },
            "opus_article_comments": {"ok": core_ok},
        },
        "core_ok": core_ok,
        "asr_managed_by_skill": False,
        "recommendations": [] if core_ok else ["Check network access to Bilibili public APIs and bundled scripts."],
    }


def print_human(report: dict[str, Any]) -> None:
    mark = lambda ok: "OK" if ok else "UNAVAILABLE"
    print("Bili Note environment")
    print(f"- Python: {mark(report['python']['ok'])} ({report['python']['executable']})")
    print(f"- Bundled scripts: {mark(report['scripts']['ok'])}")
    print(f"- Bilibili public API: {mark(report['bilibili_api']['ok'])}")
    print("- Video transcript/keyframes: MindSpace media_read (no skill-managed ASR)")
    for recommendation in report.get("recommendations") or []:
        print(f"- Recommendation: {recommendation}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when helpers are unavailable")
    parser.add_argument("--api-url", default="https://api.bilibili.com/x/web-interface/nav")
    parser.add_argument("--timeout", type=float, default=1.5)
    args = parser.parse_args()

    report = evaluate_environment(api_url=args.api_url, timeout=args.timeout)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report)
    return 1 if args.strict and not report["core_ok"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
