Place bundled officecli binaries in this directory:

- officecli-win-x64.exe
- officecli-win-arm64.exe

Runtime resolution order:

1. Matching bundled binary for `process.arch`.
2. User/system `officecli` from PATH.

`npx officecli` is intentionally not used. Agent document reading and environment checks
must reflect the same runtime path: bundled first, system fallback only.

Packaging:

- Source can contain both Windows binaries.
- `scripts/after-pack-officecli.cjs` copies only the current build architecture binary into the packaged app.
