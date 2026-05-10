"use strict";

const os = require("os");
const path = require("path");
const { ensureDir } = require("./jsonStore");

const basePath = process.env.MUSICFREE_CLI_HOME
    ? path.resolve(process.env.MUSICFREE_CLI_HOME)
    : path.join(os.homedir(), ".musicfree-cli");

const paths = {
    basePath,
    pluginPath: path.join(basePath, "plugins"),
    dataPath: path.join(basePath, "data"),
    cachePath: path.join(basePath, "cache"),
    lrcCachePath: path.join(basePath, "cache", "lrc"),
};

function ensureBaseDirs() {
    Object.values(paths).forEach(ensureDir);
}

module.exports = {
    paths,
    ensureBaseDirs,
};
