#!/usr/bin/env python3
"""Generate syntax-highlighted HTML from source code using Pygments.

Usage:
    python -m scripts.highlight_code --input code.py --output highlighted.html
    python -m scripts.highlight_code --input Main.java --language java --output code.html
    python -m scripts.highlight_code --code "print('hello')" --language python --output snippet.html

Output is a self-contained HTML fragment with inline styles, ready to embed in any HTML page.
"""

import argparse
import sys
from pathlib import Path


def highlight_file(input_path, language, output_path, style="monokai", line_numbers=True):
    """Highlight a source code file and write HTML output."""
    from pygments import highlight
    from pygments.lexers import get_lexer_by_name, guess_lexer_for_filename
    from pygments.formatters import HtmlFormatter
    from pygments.util import ClassNotFound

    with open(input_path, "r", encoding="utf-8", errors="replace") as f:
        code = f.read()

    if language:
        try:
            lexer = get_lexer_by_name(language, stripall=True)
        except ClassNotFound:
            print(f"Warning: Unknown language '{language}', attempting auto-detection", file=sys.stderr)
            try:
                lexer = guess_lexer_for_filename(input_path, code, stripall=True)
            except ClassNotFound:
                lexer = get_lexer_by_name("text", stripall=True)
    else:
        try:
            lexer = guess_lexer_for_filename(input_path, code, stripall=True)
        except ClassNotFound:
            lexer = get_lexer_by_name("text", stripall=True)

    formatter = HtmlFormatter(
        style=style,
        noclasses=True,
        linenos=line_numbers,
        linenostart=1,
        wrapcode=True,
    )

    result = highlight(code, lexer, formatter)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(result)

    print(f"Highlighted code saved to {output_path}")


def highlight_string(code, language, output_path, style="monokai", line_numbers=False):
    """Highlight a code string and write HTML output."""
    from pygments import highlight
    from pygments.lexers import get_lexer_by_name
    from pygments.formatters import HtmlFormatter
    from pygments.util import ClassNotFound

    try:
        lexer = get_lexer_by_name(language or "text", stripall=True)
    except ClassNotFound:
        lexer = get_lexer_by_name("text", stripall=True)

    formatter = HtmlFormatter(
        style=style,
        noclasses=True,
        linenos=line_numbers,
        wrapcode=True,
    )

    result = highlight(code, lexer, formatter)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(result)

    print(f"Highlighted code saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate syntax-highlighted HTML from source code")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input", help="Path to source code file")
    group.add_argument("--code", help="Source code string (inline)")
    parser.add_argument("--output", required=True, help="Output HTML file path")
    parser.add_argument("--language", default=None, help="Programming language (auto-detected from file if not specified)")
    parser.add_argument("--style", default="monokai", help="Pygments color style (default: monokai). Options: monokai, github-dark, friendly, colorful, vim, etc.")
    parser.add_argument("--no-line-numbers", action="store_true", help="Disable line numbers")

    args = parser.parse_args()

    if args.input:
        highlight_file(
            args.input,
            args.language,
            args.output,
            style=args.style,
            line_numbers=not args.no_line_numbers,
        )
    else:
        highlight_string(
            args.code,
            args.language,
            args.output,
            style=args.style,
            line_numbers=not args.no_line_numbers,
        )


if __name__ == "__main__":
    main()
