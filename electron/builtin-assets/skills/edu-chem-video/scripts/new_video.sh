#!/usr/bin/env bash
# Create a new chemistry-problem video project from the skill template.
#   bash new_video.sh <workspace_root> <folder_name>
# workspace_root = the directory the USER is working in (normally "$PWD"). The mp4/srt end up there.
#   Never pick another directory just because it already has .env / node_modules / pron.json.
# What it does:
# - copies template/ to <workspace_root>/<folder_name>/ (never node_modules / package*.json)
# - pron.py + pron.json: symlinks to the skill's shared copies (ONE lexicon for every video; a reading fixed
#   once is fixed everywhere). Existing files in the workspace are left alone.
# - node_modules: if the workspace has none, symlinks an existing install found above the skill (no 60 MB
#   re-install); otherwise writes package.json so you can `npm install` once.
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd -P)"   # -P: resolve symlinks such as ~/.codex/skills/...
[ $# -eq 2 ] || { echo "usage: bash new_video.sh <workspace_root> <folder_name>   (workspace_root: normally \"\$PWD\")"; exit 2; }
WS="$(cd "$1" && pwd -P)"; NAME="$2"
[[ "$NAME" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "folder_name must be ASCII letters/digits/-/_ (got '$NAME')"; exit 2; }

# guard: the skill's own home project is not the user's workspace when the user works elsewhere
HERE="$(pwd -P)"
case "$SKILL/" in
  "$WS"/*)
    case "$HERE/" in
      "$WS"/*) ;;  # user really is working inside this project
      *) echo "ERROR: $WS is where the skill is installed, but you are working in $HERE."
         echo "       Use the user's directory:  bash $0 \"$HERE\" $NAME"
         exit 1 ;;
    esac ;;
esac

DEST="$WS/$NAME"
[ -e "$DEST" ] && { echo "ERROR: $DEST already exists. Pick another name; never overwrite a finished video."; exit 1; }
mkdir -p "$DEST"
cp -R "$SKILL/template/." "$DEST/"
rm -rf "$DEST/build" "$DEST/node_modules"
mkdir -p "$DEST/build"

for f in pron.py pron.json; do
  if [ ! -e "$WS/$f" ]; then ln -s "$SKILL/shared/$f" "$WS/$f"; echo "linked $WS/$f -> skill shared/$f"; fi
done

if [ ! -e "$WS/node_modules/playwright" ] || [ ! -e "$WS/node_modules/ffmpeg-static" ]; then
  NM=""; d="$SKILL"
  while [ "$d" != "/" ]; do
    [ -e "$d/node_modules/playwright" ] && [ -e "$d/node_modules/ffmpeg-static" ] && { NM="$d/node_modules"; break; }
    d="$(dirname "$d")"
  done
  if [ -n "$NM" ] && [ ! -e "$WS/node_modules" ]; then
    ln -s "$NM" "$WS/node_modules"; echo "linked $WS/node_modules -> $NM (shared install, nothing copied)"
  else
    if [ ! -e "$WS/package.json" ]; then
      cat > "$WS/package.json" <<'JSON'
{
  "name": "explainer-videos",
  "private": true,
  "dependencies": { "ffmpeg-static": "^5.3.0", "playwright": "1.49" }
}
JSON
    fi
    echo "NOTE: no playwright/ffmpeg-static found. Run once: cd \"$WS\" && npm install"
  fi
fi
echo "created $DEST   (videos will be written to $WS/)"
echo "next: bash $SKILL/scripts/setup_check.sh $DEST"
