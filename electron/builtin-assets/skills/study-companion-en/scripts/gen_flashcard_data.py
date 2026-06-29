#!/usr/bin/env python3
"""Generate Anki flashcard decks (.apkg) or TSV files.

Usage:
    python -m scripts.gen_flashcard_data --data cards.json --output deck.apkg
    python -m scripts.gen_flashcard_data --data cards.json --output cards.tsv --format tsv

Input JSON format:
    {
        "deck": "High School Math - Calculus",
        "cards": [
            {
                "front": "Necessary condition for extremum",
                "back": "f'(x₀) = 0",
                "tags": ["calculus", "extremum"]
            },
            {
                "front": "Pythagorean theorem",
                "back": "a² + b² = c²",
                "tags": ["geometry"]
            }
        ]
    }
"""

import argparse
import json
import random
import sys
from pathlib import Path


def generate_tsv(data, output_path):
    """Generate TSV file for Anki import."""
    with open(output_path, "w", encoding="utf-8") as f:
        for card in data.get("cards", []):
            front = card.get("front", "").replace("\t", "    ").replace("\n", "<br>")
            back = card.get("back", "").replace("\t", "    ").replace("\n", "<br>")
            tags = " ".join(card.get("tags", []))
            f.write(f"{front}\t{back}\t{tags}\n")
    print(f"TSV file saved to {output_path} ({len(data.get('cards', []))} cards)")


def generate_apkg(data, output_path):
    """Generate Anki .apkg file using genanki."""
    try:
        import genanki
    except ImportError:
        print("Error: genanki is not installed. Install with: pip install genanki", file=sys.stderr)
        print("Falling back to TSV format...", file=sys.stderr)
        tsv_path = Path(output_path).with_suffix(".tsv")
        generate_tsv(data, tsv_path)
        return

    deck_name = data.get("deck", "Study Companion")
    cards = data.get("cards", [])

    model_id = random.randrange(1 << 30, 1 << 31)
    deck_id = random.randrange(1 << 30, 1 << 31)

    model = genanki.Model(
        model_id,
        "Study Companion Card",
        fields=[
            {"name": "Front"},
            {"name": "Back"},
        ],
        templates=[
            {
                "name": "Card 1",
                "qfmt": "{{Front}}",
                "afmt": '{{FrontSide}}<hr id="answer">{{Back}}',
            },
        ],
        css="""
            .card {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                text-align: center;
                color: #333;
                background-color: #fff;
                padding: 20px;
            }
            .card hr {
                border: none;
                border-top: 2px solid #4a90d9;
                margin: 20px 0;
            }
        """,
    )

    deck = genanki.Deck(deck_id, deck_name)

    for card in cards:
        front = card.get("front", "")
        back = card.get("back", "")
        tags = card.get("tags", [])

        note = genanki.Note(
            model=model,
            fields=[front, back],
            tags=tags,
        )
        deck.add_note(note)

    genanki.Package(deck).write_to_file(str(output_path))
    print(f"Anki deck saved to {output_path} ({len(cards)} cards)")


def main():
    parser = argparse.ArgumentParser(description="Generate Anki flashcard decks or TSV files")
    parser.add_argument("--data", required=True, help="Path to input JSON data file")
    parser.add_argument("--output", required=True, help="Output file path (.apkg or .tsv)")
    parser.add_argument("--deck-name", default=None, help="Deck name (overrides data)")
    parser.add_argument("--format", choices=["apkg", "tsv"], default=None, help="Output format (auto-detected from extension)")

    args = parser.parse_args()

    with open(args.data, "r", encoding="utf-8") as f:
        data = json.load(f)

    if args.deck_name:
        data["deck"] = args.deck_name

    output = Path(args.output)
    fmt = args.format or output.suffix.lstrip(".")

    if fmt == "apkg":
        generate_apkg(data, output)
    elif fmt == "tsv":
        generate_tsv(data, output)
    else:
        print(f"Unknown format '{fmt}'. Use .apkg or .tsv extension.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
