#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Report required Python packages and optional runtime tools.

This script deliberately never installs packages. The Agent must show the
reported command to the user and execute it only after explicit confirmation.
"""

import importlib
import json
import shutil
import sys


REQUIRED_PACKAGES = ("sympy",)
OPTIONAL_RUNTIME_TOOLS = ("node",)


def _configure_utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, OSError):
            pass


_configure_utf8_streams()


def _package_status(name: str) -> dict:
    try:
        module = importlib.import_module(name)
        available = module is not None
        error = ""
    except Exception as exc:
        available = False
        error = str(exc)
    result = {
        "name": name,
        "available": available,
        "install": f"python -m pip install {name}",
    }
    if error:
        result["error"] = error
    return result


def _runtime_status(name: str) -> dict:
    return {"name": name, "available": bool(shutil.which(name)), "kind": "optional-runtime"}


def main(argv: list[str]) -> int:
    if any(arg not in {"--json", "-h", "--help"} for arg in argv):
        print("用法: check_dependencies.py [--json]", file=sys.stderr)
        return 2

    if "-h" in argv or "--help" in argv:
        print("用法: check_dependencies.py [--json]")
        return 0

    packages = [_package_status(name) for name in REQUIRED_PACKAGES]
    runtimes = [_runtime_status(name) for name in OPTIONAL_RUNTIME_TOOLS]
    result = {
        "python": sys.executable,
        "requiredPackages": packages,
        "optionalRuntime": runtimes,
        "ready": all(item["available"] for item in packages),
    }

    if "--json" in argv:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(f"Python: {sys.executable}")
        for item in packages:
            state = "可用" if item["available"] else "缺失"
            print(f"必需包 {item['name']}: {state}")
        for item in runtimes:
            state = "可用" if item["available"] else "未找到（可选）"
            print(f"可选运行时 {item['name']}: {state}")
        missing = [item["name"] for item in packages if not item["available"]]
        if missing:
            print("缺少必需包。请先向用户展示并确认以下一次性安装命令：")
            print("python -m pip install " + " ".join(missing))
        else:
            print("必需依赖已满足；没有执行安装。")

    return 0 if result["ready"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
