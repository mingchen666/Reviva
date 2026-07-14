# Legacy Localhost Preview

This project previously exposed a `--serve` option that generated a temporary Node.js server and printed `http://localhost:8080`. That path is retired.

## Current Policy

`SELF_CONTAINED_HTML_ONLY`: geometry-assistant outputs a standalone HTML file. Users open the generated HTML directly in a browser. The skill must not require users to start a local server, stop Node processes, or visit `localhost:8080`.

## Why It Was Removed

- Skill users should receive one portable HTML artifact.
- Local ports can point at stale or unrelated projects.
- Stopping Node processes can disrupt other work.
- Server preview caused repeated confusion during template debugging.

## Historical Behavior

The old implementation created `server.js` beside the output HTML, started Node on port 8080, and printed the localhost URL. Keep that behavior archived only; do not restore it to the active CLI or skill workflow.
