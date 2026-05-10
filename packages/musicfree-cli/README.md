# MusicFree CLI MVP

Node CLI runtime for calling MusicFree plugins from agents.

This MVP intentionally excludes the React Native UI, playback service, downloader,
and local music scanner. It focuses on plugin installation and JSON-first plugin
method calls.

## Usage

Use a separate CLI home while testing:

```bash
MUSICFREE_CLI_HOME=/tmp/musicfree-cli npm run cli -- plugin install packages/musicfree-cli/examples/mock-plugin.js
MUSICFREE_CLI_HOME=/tmp/musicfree-cli npm run cli -- plugin list
MUSICFREE_CLI_HOME=/tmp/musicfree-cli npm run cli -- search hello --plugin MockMusic --limit 1
```

Resolve a media source:

```bash
MUSICFREE_CLI_HOME=/tmp/musicfree-cli npm run cli -- source \
  --plugin MockMusic \
  --item-json '{"id":"music-hello-1","platform":"MockMusic","title":"hello","url":"https://example.com/mock.mp3"}'
```

Download a playlist-like link through a plugin:

```bash
MUSICFREE_CLI_HOME=/tmp/musicfree-cli npm run cli -- download-sheet \
  'https://music.163.com/playlist?id=123456' \
  --plugin 网易 \
  --out ./downloads \
  --quality standard \
  --limit 20
```

All command results use the same envelope:

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

## Commands

- `plugin list`
- `plugin install <file>`
- `plugin install-url <url>`
- `plugin install-url <subscription-json-url> --plugin <name>`
- `plugin enable <name-or-hash>`
- `plugin disable <name-or-hash>`
- `search <query> [--type music] [--plugin name-or-hash] [--page 1] [--limit 20]`
- `source --item-json <json> [--plugin name-or-hash] [--quality standard]`
- `lyric --item-json <json> [--plugin name-or-hash]`
- `import-music <url-like> --plugin <name-or-hash>`
- `import-sheet <url-like> --plugin <name-or-hash>`
- `download --item-json <json> --plugin <name-or-hash> --out <dir>`
- `download-sheet <url-like> --plugin <name-or-hash> --out <dir> [--limit 10]`
- `album --item-json <json> [--plugin name-or-hash] [--page 1]`
- `sheet --item-json <json> [--plugin name-or-hash] [--page 1]`

## Runtime Notes

The CLI simulates the MusicFree Android plugin environment:

- `env.os` and `process.platform` are set to `android`.
- `env.appVersion` defaults to `0.6.2`.
- Plugin data is stored under `~/.musicfree-cli`, or `MUSICFREE_CLI_HOME`.
- Allowed plugin packages are limited to the dependencies already used by
  MusicFree plugins, such as `axios`, `cheerio`, `crypto-js`, `dayjs`, `qs`,
  `he`, `big-integer`, and `webdav`.

The CLI does not bundle or recommend music source plugins.
