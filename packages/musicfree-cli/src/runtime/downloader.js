"use strict";

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");

function safeFileName(value) {
    return String(value || "")
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
}

function extensionFromUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        const ext = path.extname(pathname);
        return ext && ext.length <= 8 ? ext : ".mp3";
    } catch {
        return ".mp3";
    }
}

function buildMusicFileBaseName(musicItem) {
    const artist = safeFileName(musicItem.artist || "Unknown Artist");
    const title = safeFileName(musicItem.title || musicItem.id || "Unknown Title");
    return `${artist} - ${title}`;
}

function buildMusicFileName(musicItem, source) {
    return `${buildMusicFileBaseName(musicItem)}${extensionFromUrl(source.url)}`;
}

const audioExtensions = new Set([
    ".mp3",
    ".flac",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".opus",
    ".ape",
    ".wma",
]);

function addAudioFileToIndex(index, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!audioExtensions.has(ext)) {
        return;
    }
    const baseName = path.basename(filePath, ext);
    if (!index.has(baseName)) {
        index.set(baseName, filePath);
    }
}

function buildExistingMusicIndex(outDir) {
    const index = new Map();
    if (!fs.existsSync(outDir)) {
        return index;
    }

    const stack = [outDir];
    while (stack.length > 0) {
        const currentDir = stack.pop();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        entries.forEach(entry => {
            const entryPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                stack.push(entryPath);
            } else if (entry.isFile()) {
                addAudioFileToIndex(index, entryPath);
            }
        });
    }

    return index;
}

function findExistingMusicFile(existingMusicIndex, musicItem) {
    return existingMusicIndex?.get(buildMusicFileBaseName(musicItem)) || null;
}

function emitLog(options, message) {
    if (typeof options.onLog === "function") {
        options.onLog(message);
    }
}

async function downloadUrlToFile(source, targetPath) {
    const headers = source.headers || {};
    if (source.userAgent && !headers["user-agent"] && !headers["User-Agent"]) {
        headers["User-Agent"] = source.userAgent;
    }
    const response = await fetch(source.url, { headers });
    if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(targetPath));
}

async function downloadMusicItem(plugin, musicItem, options) {
    const quality = options.quality || "standard";
    const existingPath = options.overwrite
        ? null
        : findExistingMusicFile(options.existingMusicIndex, musicItem);
    if (existingPath) {
        emitLog(
            options,
            `[skip] ${buildMusicFileBaseName(musicItem)} already exists: ${existingPath}`,
        );
        return {
            ok: true,
            skipped: true,
            item: musicItem,
            path: existingPath,
            reason: "Song already exists in output directory.",
        };
    }

    const source = await plugin.methods.getMediaSource(musicItem, quality);
    if (!source?.url) {
        emitLog(options, `[fail] ${buildMusicFileBaseName(musicItem)} has no media source URL.`);
        return {
            ok: false,
            item: musicItem,
            error: "No media source URL.",
        };
    }

    const targetPath = path.join(options.outDir, buildMusicFileName(musicItem, source));
    if (fs.existsSync(targetPath) && !options.overwrite) {
        emitLog(
            options,
            `[skip] ${buildMusicFileBaseName(musicItem)} already exists: ${targetPath}`,
        );
        return {
            ok: true,
            skipped: true,
            item: musicItem,
            source,
            path: targetPath,
        };
    }

    emitLog(options, `[download] ${buildMusicFileBaseName(musicItem)} -> ${targetPath}`);
    await downloadUrlToFile(source, targetPath);
    addAudioFileToIndex(options.existingMusicIndex, targetPath);
    emitLog(options, `[done] ${buildMusicFileBaseName(musicItem)} -> ${targetPath}`);
    return {
        ok: true,
        item: musicItem,
        source,
        path: targetPath,
    };
}

async function downloadMusicSheet(plugin, urlLike, options) {
    const musicList = await plugin.methods.importMusicSheet(urlLike);
    const limit = options.limit ? Math.min(options.limit, musicList.length) : musicList.length;
    const selected = musicList.slice(0, limit);
    const results = [];
    options.existingMusicIndex = options.existingMusicIndex || buildExistingMusicIndex(options.outDir);

    for (let index = 0; index < selected.length; index += 1) {
        const item = selected[index];
        try {
            results.push({
                index,
                ...(await downloadMusicItem(plugin, item, options)),
            });
        } catch (error) {
            emitLog(
                options,
                `[fail] ${buildMusicFileBaseName(item)}: ${error?.message || String(error)}`,
            );
            results.push({
                index,
                ok: false,
                item,
                error: error?.message || String(error),
            });
        }
    }

    return {
        total: musicList.length,
        requested: selected.length,
        succeeded: results.filter(item => item.ok && !item.skipped).length,
        skipped: results.filter(item => item.ok && item.skipped).length,
        failed: results.filter(item => !item.ok).length,
        results,
    };
}

module.exports = {
    downloadMusicItem,
    downloadMusicSheet,
};
