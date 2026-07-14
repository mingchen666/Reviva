#!/usr/bin/env python3
"""Validate a generated Geometry Assistant HTML artifact.

This checker is intentionally dependency-free. It verifies the single-file
artifact structure, extracts module scripts to an explicitly supplied path,
and optionally asks Node.js to perform a syntax check.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path


MODULE_SCRIPT_RE = re.compile(
    r"<script\b[^>]*\btype=[\"']module[\"'][^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Validate Geometry Assistant standalone HTML output."
    )
    parser.add_argument("html_file", help="Generated HTML file to validate")
    parser.add_argument(
        "--module-output",
        required=True,
        help="Explicit temporary .mjs path used for the extracted module script",
    )
    parser.add_argument(
        "--node-check",
        action="store_true",
        help="Run `node --check` when Node.js is available",
    )
    return parser.parse_args(argv)


def fail(message: str, code: int = 1) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(code)


def main(argv=None):
    args = parse_args(argv)
    html_path = Path(args.html_file)
    module_path = Path(args.module_output)

    if not html_path.is_file():
        fail(f"HTML file does not exist: {html_path}")

    try:
        html = html_path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        fail(f"Unable to read HTML file: {exc}")

    if not html.strip():
        fail("HTML file is empty")
    if "window.__GEOMETRY_DATA__" not in html:
        fail("window.__GEOMETRY_DATA__ is not embedded")
    if "<script type=\"importmap\">" not in html and "<script type='importmap'>" not in html:
        fail("HTML does not contain an importmap")
    if "cdn.jsdelivr.net/npm/three@" not in html:
        fail("Three.js jsDelivr CDN mapping is missing")
    if re.search(r"https?://(?:localhost|127\.0\.0\.1)(?::\d+)?", html, re.IGNORECASE):
        fail("HTML contains an active localhost URL")

    modules = MODULE_SCRIPT_RE.findall(html)
    if not modules:
        fail("No <script type=\"module\"> block was found")

    module_path.parent.mkdir(parents=True, exist_ok=True)
    module_text = "\n\n".join(modules).strip() + "\n"
    try:
        module_path.write_text(module_text, encoding="utf-8")
    except OSError as exc:
        fail(f"Unable to write extracted module script: {exc}")

    node_status = "skipped"
    if args.node_check:
        node = shutil.which("node")
        if node:
            completed = subprocess.run(
                [node, "--check", str(module_path)],
                text=True,
                capture_output=True,
                check=False,
            )
            if completed.returncode != 0:
                detail = (completed.stderr or completed.stdout).strip()
                fail(f"node --check failed: {detail}", code=2)
            node_status = "passed"
        else:
            node_status = "skipped (Node.js unavailable)"

    print(f"HTML validation passed: {html_path.resolve()}")
    print(f"Embedded module extracted: {module_path.resolve()}")
    print(f"Node syntax check: {node_status}")


if __name__ == "__main__":
    main()
