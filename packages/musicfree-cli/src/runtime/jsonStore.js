"use strict";

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, value) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

class JsonStore {
    constructor(file) {
        this.file = file;
        this.data = readJson(file, {});
    }

    persist() {
        writeJson(this.file, this.data);
    }

    getString(key) {
        const value = this.data[key];
        if (value === undefined || value === null) {
            return undefined;
        }
        return String(value);
    }

    getNumber(key) {
        const value = Number(this.data[key]);
        return Number.isFinite(value) ? value : undefined;
    }

    set(key, value) {
        this.data[key] = value;
        this.persist();
    }

    delete(key) {
        delete this.data[key];
        this.persist();
    }

    contains(key) {
        return Object.prototype.hasOwnProperty.call(this.data, key);
    }

    getAllKeys() {
        return Object.keys(this.data);
    }

    clearAll() {
        this.data = {};
        this.persist();
    }
}

module.exports = {
    JsonStore,
    ensureDir,
    readJson,
    writeJson,
};
