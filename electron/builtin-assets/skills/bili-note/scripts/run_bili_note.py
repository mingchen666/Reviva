#!/usr/bin/env python3
"""Extract and archive Bilibili opus/article posts for Bili Note."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
EXTRACT_OPUS_SCRIPT = SCRIPT_DIR / "extract_bilibili_opus.py"
ARCHIVE_SCRIPT = SCRIPT_DIR / "archive_bili_materials.py"


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


def safe_slug(value: str, default: str = "opus") -> str:
    cleaned = re.sub(r"[^0-9A-Za-z._-]+", "_", value.strip()).strip("._-")
    return cleaned or default


def opus_id(source: str) -> str:
    patterns = [r"/(?:opus|dynamic)/(\d+)", r"^\d+$"]
    for pattern in patterns:
        match = re.search(pattern, source, re.I)
        if match:
            return match.group(1) if match.lastindex else match.group(0)
    raise ValueError(
        "run_bili_note.py only handles Bilibili opus/article inputs. "
        "For videos, attach a parsed MindSpace media item and use media_read."
    )


def run_cmd(cmd: list[str], dry_run: bool = False) -> dict[str, Any]:
    if dry_run:
        return {"command": cmd, "returncode": None, "dry_run": True}
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    result = {
        "command": cmd,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or f"Command failed: {cmd}")
    return result


def main() -> int:
    configure_stdout()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Bilibili opus/article URL or numeric opus id")
    parser.add_argument("--work-dir", help="Temporary extraction directory")
    parser.add_argument("--archive-dir", help="Permanent archive directory")
    parser.add_argument("--comments", action="store_true", help="Fetch comments")
    parser.add_argument(
        "--download-images",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Download article images",
    )
    parser.add_argument("--archive", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--force", action="store_true", help="Re-run existing outputs")
    parser.add_argument("--dry-run", action="store_true", help="Print planned commands")
    args = parser.parse_args()

    try:
        source_id = opus_id(args.source)
    except ValueError as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 2

    work_dir = Path(args.work_dir) if args.work_dir else Path.cwd() / f"tmp_bili_opus_{safe_slug(source_id)}"
    archive_dir = Path(args.archive_dir) if args.archive_dir else None
    work_dir.mkdir(parents=True, exist_ok=True)

    extract_cmd = [sys.executable, str(EXTRACT_OPUS_SCRIPT), args.source, "--out", str(work_dir)]
    if not args.download_images:
        extract_cmd.append("--no-download-images")
    if args.comments:
        extract_cmd.append("--comments")
    if args.force:
        extract_cmd.append("--force")

    steps = [{"name": "opus_content_images_comments", **run_cmd(extract_cmd, args.dry_run)}]

    if args.archive and archive_dir:
        archive_cmd = [
            sys.executable,
            str(ARCHIVE_SCRIPT),
            "--extract-dir",
            str(work_dir),
            "--archive-dir",
            str(archive_dir),
        ]
        steps.append({"name": "archive_materials", **run_cmd(archive_cmd, args.dry_run)})

    report = {
        "success": True,
        "kind": "opus",
        "source": args.source,
        "opus_id": source_id,
        "work_dir": str(work_dir),
        "archive_dir": str(archive_dir) if archive_dir else None,
        "steps": steps,
    }
    (work_dir / "bili_note_run_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
