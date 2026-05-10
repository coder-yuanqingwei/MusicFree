#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { PluginManager } = require("./runtime/pluginManager");
const { downloadMusicItem, downloadMusicSheet } = require("./runtime/downloader");

const manager = new PluginManager();

function printJson(payload) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function ok(data) {
    printJson({ ok: true, data, error: null });
}

function fail(error, code = "CLI_ERROR") {
    printJson({
        ok: false,
        data: null,
        error: {
            code,
            message: error?.message || String(error),
        },
    });
    process.exitCode = 1;
}

function usage() {
    process.stdout.write(`MusicFree CLI MVP

Usage:
  musicfree-cli plugin list
  musicfree-cli plugin install <file>
  musicfree-cli plugin install-url <url> [--plugin name]
  musicfree-cli plugin enable <name-or-hash>
  musicfree-cli plugin disable <name-or-hash>
  musicfree-cli search <query> [--type music] [--plugin name-or-hash] [--page 1] [--limit 20]
  musicfree-cli source --item-json <json> [--plugin name-or-hash] [--quality standard]
  musicfree-cli lyric --item-json <json> [--plugin name-or-hash]
  musicfree-cli import-music <url-like> --plugin <name-or-hash>
  musicfree-cli import-sheet <url-like> --plugin <name-or-hash>
  musicfree-cli download --item-json <json> --plugin <name-or-hash> --out <dir>
  musicfree-cli download-sheet <url-like> --plugin <name-or-hash> --out <dir> [--limit 10]
  musicfree-cli album --item-json <json> [--plugin name-or-hash] [--page 1]
  musicfree-cli sheet --item-json <json> [--plugin name-or-hash] [--page 1]

Options:
  --item-json <json>     Inline media item JSON
  --item-file <file>     Read media item JSON from file
  --plugin <value>       Plugin name or hash. For subscription JSON, install one plugin by name.
  --type <value>         music | album | artist | sheet | lyric
  --page <number>        Page number, default 1
  --limit <number>       Limit result items for agent calls
  --quality <value>      low | standard | high | super
  --out <dir>            Download output directory
  --overwrite            Overwrite existing files
`);
}

function parseArgs(argv) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith("--")) {
            positional.push(arg);
            continue;
        }
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith("--")) {
            flags[key] = true;
        } else {
            flags[key] = next;
            i += 1;
        }
    }
    return { positional, flags };
}

function readItem(flags) {
    if (flags["item-json"]) {
        return JSON.parse(flags["item-json"]);
    }
    if (flags["item-file"]) {
        return JSON.parse(fs.readFileSync(flags["item-file"], "utf8"));
    }
    throw new Error("Missing --item-json or --item-file.");
}

function numberFlag(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function selectPlugin(flags, item) {
    const key = flags.plugin || item?.platform;
    const plugin = manager.getByNameOrHash(key);
    if (!plugin) {
        throw new Error(key ? `Plugin not found: ${key}` : "Missing --plugin.");
    }
    return plugin;
}

function trimPageResult(result, limit) {
    if (!limit || !Array.isArray(result?.data)) {
        return result;
    }
    return {
        ...result,
        data: result.data.slice(0, limit),
    };
}

function logDownloadEvent(message) {
    process.stderr.write(`${message}\n`);
}

async function main() {
    const { positional, flags } = parseArgs(process.argv.slice(2));
    const [command, subcommand] = positional;

    if (!command || command === "--help" || command === "help") {
        usage();
        return;
    }

    manager.setup();

    if (command === "plugin") {
        if (subcommand === "list") {
            ok(manager.list());
            return;
        }
        if (subcommand === "install") {
            ok(manager.installPluginFromLocalFile(positional[2]));
            return;
        }
        if (subcommand === "install-url") {
            ok(await manager.installPluginFromUrl(positional[2], { pluginName: flags.plugin }));
            return;
        }
        if (subcommand === "enable" || subcommand === "disable") {
            const plugin = manager.getByNameOrHash(positional[2]);
            if (!plugin) {
                throw new Error(`Plugin not found: ${positional[2]}`);
            }
            manager.setPluginEnabled(plugin, subcommand === "enable");
            ok(plugin.toJSON());
            return;
        }
    }

    if (command === "search") {
        const query = positional[1];
        if (!query) {
            throw new Error("Missing search query.");
        }
        const type = flags.type || "music";
        const page = numberFlag(flags.page, 1);
        const limit = flags.limit ? numberFlag(flags.limit, 20) : null;
        const plugins = flags.plugin
            ? [selectPlugin(flags)]
            : manager.getSearchablePlugins(type);
        const results = [];
        for (const plugin of plugins) {
            const result = await plugin.methods.search(query, page, type);
            results.push({
                plugin: plugin.toJSON(),
                result: trimPageResult(result, limit),
            });
        }
        ok(results);
        return;
    }

    if (command === "source") {
        const item = readItem(flags);
        const plugin = selectPlugin(flags, item);
        ok(await plugin.methods.getMediaSource(item, flags.quality || "standard"));
        return;
    }

    if (command === "lyric") {
        const item = readItem(flags);
        const plugin = selectPlugin(flags, item);
        ok(await plugin.methods.getLyric(item));
        return;
    }

    if (command === "import-music") {
        const plugin = selectPlugin(flags);
        ok(await plugin.methods.importMusicItem(positional[1]));
        return;
    }

    if (command === "import-sheet") {
        const plugin = selectPlugin(flags);
        ok(await plugin.methods.importMusicSheet(positional[1]));
        return;
    }

    if (command === "download") {
        const item = readItem(flags);
        const plugin = selectPlugin(flags, item);
        if (!flags.out) {
            throw new Error("Missing --out.");
        }
        ok(
            await downloadMusicItem(plugin, item, {
                outDir: path.resolve(flags.out),
                quality: flags.quality || "standard",
                overwrite: Boolean(flags.overwrite),
                onLog: logDownloadEvent,
            }),
        );
        return;
    }

    if (command === "download-sheet") {
        const plugin = selectPlugin(flags);
        if (!positional[1]) {
            throw new Error("Missing sheet url.");
        }
        if (!flags.out) {
            throw new Error("Missing --out.");
        }
        ok(
            await downloadMusicSheet(plugin, positional[1], {
                outDir: path.resolve(flags.out),
                quality: flags.quality || "standard",
                limit: flags.limit ? numberFlag(flags.limit, 0) : null,
                overwrite: Boolean(flags.overwrite),
                onLog: logDownloadEvent,
            }),
        );
        return;
    }

    if (command === "album") {
        const item = readItem(flags);
        const plugin = selectPlugin(flags, item);
        ok(await plugin.methods.getAlbumInfo(item, numberFlag(flags.page, 1)));
        return;
    }

    if (command === "sheet") {
        const item = readItem(flags);
        const plugin = selectPlugin(flags, item);
        ok(await plugin.methods.getMusicSheetInfo(item, numberFlag(flags.page, 1)));
        return;
    }

    throw new Error(`Unknown command: ${command}${subcommand ? ` ${subcommand}` : ""}`);
}

main().catch(error => fail(error));
