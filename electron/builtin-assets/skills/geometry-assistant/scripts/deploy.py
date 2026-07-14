#!/usr/bin/env python3
"""Thin wrapper for Codex-skill backward compatibility.

Delegates to the geometry_assistant package. For pip-installed usage,
run `geometry-assistant <json_file>` instead.
"""
import os
import sys
from pathlib import Path

# Ensure the package source is importable (works both pip-installed and dev)
_PACKAGE_SRC = Path(__file__).resolve().parent.parent / "src"
if _PACKAGE_SRC.exists():
    sys.path.insert(0, os.fspath(_PACKAGE_SRC))

from geometry_assistant.cli import main

if __name__ == "__main__":
    main()
