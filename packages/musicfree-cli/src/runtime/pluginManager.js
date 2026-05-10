"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Plugin, PluginState } = require("./plugin");
const pluginMeta = require("./pluginMeta");
const { paths, ensureBaseDirs } = require("./paths");

function readPluginFile(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function copyPluginFile(sourcePath, targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
}

function shortId(input) {
    return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

class PluginManager {
    constructor() {
        this.plugins = [];
    }

    setup() {
        ensureBaseDirs();
        const files = fs
            .readdirSync(paths.pluginPath, { withFileTypes: true })
            .filter(file => file.isFile() && file.name.endsWith(".js"));
        this.plugins = files
            .map(file => {
                const pluginPath = path.join(paths.pluginPath, file.name);
                return new Plugin(readPluginFile(pluginPath), pluginPath);
            })
            .filter(plugin => plugin.state === PluginState.Mounted);
        return this.plugins;
    }

    installPluginFromLocalFile(sourcePath) {
        ensureBaseDirs();
        const absoluteSource = path.resolve(sourcePath);
        const code = readPluginFile(absoluteSource);
        const plugin = new Plugin(code, absoluteSource);
        if (plugin.state !== PluginState.Mounted) {
            return {
                success: false,
                message: plugin.error || "插件无法解析",
            };
        }
        const existing = this.plugins.find(item => item.hash === plugin.hash);
        if (existing) {
            return {
                success: true,
                message: "插件已安装",
                pluginName: existing.name,
                pluginHash: existing.hash,
            };
        }
        const targetPath = path.join(paths.pluginPath, `${shortId(plugin.hash)}.js`);
        copyPluginFile(absoluteSource, targetPath);
        const installed = new Plugin(code, targetPath);
        this.plugins = this.plugins.filter(item => item.name !== installed.name).concat(installed);
        return {
            success: true,
            pluginName: installed.name,
            pluginHash: installed.hash,
            pluginPath: targetPath,
        };
    }

    async installPluginFromUrl(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch plugin URL: ${response.status} ${response.statusText}`);
        }
        const code = await response.text();
        const subscription = parsePluginSubscription(code);
        if (subscription) {
            const candidates = options.pluginName
                ? subscription.plugins.filter(plugin => plugin.name === options.pluginName)
                : subscription.plugins;
            if (options.pluginName && candidates.length === 0) {
                throw new Error(`Plugin "${options.pluginName}" not found in subscription.`);
            }
            const results = [];
            for (const plugin of candidates) {
                results.push({
                    name: plugin.name,
                    version: plugin.version,
                    url: plugin.url,
                    result: await this.installPluginFromUrl(plugin.url),
                });
            }
            return {
                success: results.every(item => item.result?.success),
                subscription: true,
                count: results.length,
                results,
            };
        }
        const tmpPath = path.join(paths.cachePath, `${shortId(url)}.js`);
        fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
        fs.writeFileSync(tmpPath, code, "utf8");
        return this.installPluginFromLocalFile(tmpPath);
    }

    list() {
        return this.plugins.map(plugin => plugin.toJSON());
    }

    getByName(name) {
        return this.plugins.find(plugin => plugin.name === name);
    }

    getByHash(hash) {
        return this.plugins.find(plugin => plugin.hash === hash);
    }

    getByNameOrHash(nameOrHash) {
        if (!nameOrHash) {
            return null;
        }
        return this.getByName(nameOrHash) || this.getByHash(nameOrHash);
    }

    getEnabledPlugins() {
        return this.plugins.filter(plugin => pluginMeta.isPluginEnabled(plugin.name));
    }

    getSearchablePlugins(type) {
        return this.getEnabledPlugins().filter(plugin => {
            if (!plugin.supportedMethods.has("search")) {
                return false;
            }
            return type && plugin.instance.supportedSearchType
                ? plugin.instance.supportedSearchType.includes(type)
                : true;
        });
    }

    getPluginsWithAbility(ability) {
        return this.getEnabledPlugins().filter(plugin => plugin.supportedMethods.has(ability));
    }

    setPluginEnabled(plugin, enabled) {
        pluginMeta.setPluginEnabled(plugin.name, enabled);
    }
}

function parsePluginSubscription(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.plugins)) {
            return null;
        }
        const plugins = parsed.plugins.filter(plugin => plugin?.url && plugin?.name);
        return plugins.length ? { plugins } : null;
    } catch {
        return null;
    }
}

module.exports = {
    PluginManager,
};
