"use strict";

const crypto = require("crypto");
const fs = require("fs");
const { URL } = require("url");
const { addFileScheme, getLocalPath, resetMediaItem } = require("./media");
const mediaCache = require("./mediaCache");
const pluginMeta = require("./pluginMeta");

const appVersion = process.env.MUSICFREE_APP_VERSION || "0.6.2";

const PluginState = {
    Initializing: "initializing",
    Loading: "loading",
    Mounted: "mounted",
    Error: "error",
};

function sha256(input) {
    return crypto.createHash("sha256").update(input).digest("hex");
}

function optionalRequire(packageName) {
    try {
        return require(packageName);
    } catch (error) {
        const wrapped = new Error(
            `Plugin requires "${packageName}", but it is not installed. Run npm install in the project root.`,
        );
        wrapped.cause = error;
        throw wrapped;
    }
}

function requireShim(packageName) {
    const packages = {
        axios: () => optionalRequire("axios"),
        cheerio: () => optionalRequire("cheerio"),
        "crypto-js": () => optionalRequire("crypto-js"),
        dayjs: () => optionalRequire("dayjs"),
        "big-integer": () => optionalRequire("big-integer"),
        qs: () => optionalRequire("qs"),
        he: () => optionalRequire("he"),
        webdav: () => optionalRequire("webdav"),
        "@react-native-cookies/cookies": () => ({
            get: notImplemented,
            set: notImplemented,
            flush: notImplemented,
        }),
    };
    const loader = packages[packageName];
    if (!loader) {
        throw new Error(`Plugin require("${packageName}") is not allowed in MusicFree CLI MVP.`);
    }
    const pkg = loader();
    if (pkg && typeof pkg === "object" && !pkg.default) {
        pkg.default = pkg;
    }
    return pkg;
}

function notImplemented() {
    throw new Error("This API is not implemented in MusicFree CLI MVP.");
}

function consoleBind(method, ...args) {
    const fn = console[method] || console.log;
    fn(...args);
}

const pluginConsole = {
    log: consoleBind.bind(null, "log"),
    warn: consoleBind.bind(null, "warn"),
    info: consoleBind.bind(null, "info"),
    error: consoleBind.bind(null, "error"),
};

function formatAuthUrl(url) {
    const urlObj = new URL(url);
    try {
        if (urlObj.username && urlObj.password) {
            const auth = Buffer.from(
                `${decodeURIComponent(urlObj.username)}:${decodeURIComponent(urlObj.password)}`,
            ).toString("base64");
            urlObj.username = "";
            urlObj.password = "";
            return {
                url: urlObj.toString(),
                auth: `Basic ${auth}`,
            };
        }
    } catch {
        return { url };
    }
    return { url };
}

class PluginMethodsWrapper {
    constructor(plugin, ensurePluginIsMounted) {
        this.plugin = plugin;
        this.ensurePluginIsMounted = ensurePluginIsMounted;
    }

    async search(query, page, type) {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.search) {
            return { isEnd: true, data: [] };
        }
        const result = (await this.plugin.instance.search(query, page, type)) || {};
        const data = Array.isArray(result.data) ? result.data : [];
        data.forEach(item => resetMediaItem(item, this.plugin.name));
        return {
            isEnd: result.isEnd ?? true,
            data,
        };
    }

    async getMediaSource(musicItem, quality = "standard", retryCount = 1) {
        await this.ensurePluginIsMounted();
        const localPath = getLocalPath(musicItem);
        if (localPath && fs.existsSync(localPath.replace(/^file:\/\//, ""))) {
            return { url: addFileScheme(localPath) };
        }

        const cached = mediaCache.getMediaCache(musicItem);
        if (cached?.source?.[quality]?.url) {
            return cached.source[quality];
        }

        if (!this.plugin.instance.getMediaSource) {
            const fallbackUrl = musicItem?.qualities?.[quality]?.url || musicItem.url;
            if (!fallbackUrl) {
                return null;
            }
            const formatted = formatAuthUrl(fallbackUrl);
            return {
                url: formatted.url,
                headers: formatted.auth ? { Authorization: formatted.auth } : undefined,
            };
        }

        try {
            const result = await this.plugin.instance.getMediaSource(
                resetMediaItem(musicItem, undefined, true),
                quality,
            );
            if (!result?.url) {
                return null;
            }
            const formatted = formatAuthUrl(result.url);
            const source = {
                ...result,
                url: formatted.url,
                headers: {
                    ...(result.headers || {}),
                    ...(formatted.auth ? { Authorization: formatted.auth } : {}),
                },
                userAgent: result.userAgent || result.headers?.["user-agent"],
            };
            mediaCache.setMediaCache({
                ...musicItem,
                source: {
                    ...(cached?.source || musicItem.source || {}),
                    [quality]: source,
                },
            });
            return source;
        } catch (error) {
            if (retryCount > 0) {
                return this.getMediaSource(musicItem, quality, retryCount - 1);
            }
            throw error;
        }
    }

    async getLyric(musicItem) {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getLyric) {
            return null;
        }
        return (
            (await this.plugin.instance.getLyric(resetMediaItem(musicItem, undefined, true))) ||
            null
        );
    }

    async getMusicInfo(musicItem) {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getMusicInfo) {
            return null;
        }
        return (
            (await this.plugin.instance.getMusicInfo(resetMediaItem(musicItem, undefined, true))) ||
            null
        );
    }

    async getAlbumInfo(albumItem, page = 1) {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getAlbumInfo) {
            return {
                albumItem,
                musicList: albumItem?.musicList || [],
                isEnd: true,
            };
        }
        const result = await this.plugin.instance.getAlbumInfo(
            resetMediaItem(albumItem, undefined, true),
            page,
        );
        result?.musicList?.forEach(item => resetMediaItem(item, this.plugin.name));
        return result || null;
    }

    async getMusicSheetInfo(sheetItem, page = 1) {
        await this.ensurePluginIsMounted();
        if (!this.plugin.instance.getMusicSheetInfo) {
            return {
                sheetItem,
                musicList: sheetItem?.musicList || [],
                isEnd: true,
            };
        }
        const result = await this.plugin.instance.getMusicSheetInfo(
            resetMediaItem(sheetItem, undefined, true),
            page,
        );
        result?.musicList?.forEach(item => resetMediaItem(item, this.plugin.name));
        return result || null;
    }

    async importMusicItem(urlLike) {
        await this.ensurePluginIsMounted();
        const result = await this.plugin.instance.importMusicItem?.(urlLike);
        return result ? resetMediaItem(result, this.plugin.name) : null;
    }

    async importMusicSheet(urlLike) {
        await this.ensurePluginIsMounted();
        const result = (await this.plugin.instance.importMusicSheet?.(urlLike)) || [];
        result.forEach(item => resetMediaItem(item, this.plugin.name));
        return result;
    }

    async getTopLists() {
        await this.ensurePluginIsMounted();
        return (await this.plugin.instance.getTopLists?.()) || [];
    }

    async getTopListDetail(topListItem, page = 1) {
        await this.ensurePluginIsMounted();
        const result = await this.plugin.instance.getTopListDetail?.(topListItem, page);
        result?.musicList?.forEach(item => resetMediaItem(item, this.plugin.name));
        return result || null;
    }
}

class Plugin {
    constructor(funcCode, pluginPath) {
        this.name = "";
        this.hash = "";
        this.state = PluginState.Initializing;
        this.error = null;
        this.instance = { platform: "" };
        this.path = pluginPath;
        this.supportedMethods = new Set();
        this.mountPlugin(funcCode, pluginPath);
        this.methods = new PluginMethodsWrapper(this, async () => {});
    }

    mountPlugin(funcCode, pluginPath) {
        this.state = PluginState.Loading;
        const moduleObj = { exports: {} };
        try {
            const env = {
                getUserVariables: () => pluginMeta.getUserVariables(this.name),
                get userVariables() {
                    return this.getUserVariables() || {};
                },
                appVersion,
                os: "android",
                lang: "zh-CN",
            };
            const processShim = {
                platform: "android",
                version: appVersion,
                env,
            };
            Function(`
                'use strict';
                return function(require, __musicfree_require, module, exports, console, env, URL, process) {
                    ${funcCode}
                }
            `)()(requireShim, requireShim, moduleObj, moduleObj.exports, pluginConsole, env, URL, processShim);

            const instance = moduleObj.exports.default || moduleObj.exports;
            this.checkValid(instance);
            this.instance = instance;
            this.name = instance.platform;
            this.hash = sha256(funcCode);
            this.supportedMethods = new Set(
                Object.keys(instance).filter(key => typeof instance[key] === "function"),
            );
            this.state = this.name ? PluginState.Mounted : PluginState.Error;
            if (!this.name) {
                this.error = "Plugin platform is empty.";
            }
        } catch (error) {
            this.state = PluginState.Error;
            this.error = error?.message || String(error);
            this.instance = { platform: "" };
            this.hash = "";
        }
    }

    checkValid(instance) {
        if (!instance || typeof instance !== "object") {
            throw new Error("Plugin did not export an object.");
        }
        if (!instance.platform) {
            throw new Error("Plugin missing required field: platform.");
        }
    }

    toJSON() {
        return {
            name: this.name,
            hash: this.hash,
            path: this.path,
            state: this.state,
            error: this.error,
            version: this.instance.version,
            author: this.instance.author,
            description: this.instance.description,
            supportedSearchType: this.instance.supportedSearchType,
            defaultSearchType: this.instance.defaultSearchType,
            supportedMethods: [...this.supportedMethods],
            enabled: pluginMeta.isPluginEnabled(this.name),
        };
    }
}

module.exports = {
    Plugin,
    PluginState,
};
