"use strict";

const path = require("path");
const { JsonStore } = require("./jsonStore");
const { paths } = require("./paths");

const store = new JsonStore(path.join(paths.dataPath, "plugin-meta.json"));

function parseJson(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function getPluginOrder() {
    return parseJson(store.getString("order"), {});
}

function setPluginOrder(orderMap) {
    store.set("order", JSON.stringify(orderMap));
}

function getDisabledPlugins() {
    return new Set(parseJson(store.getString("disabledPlugins"), []));
}

function isPluginEnabled(pluginPlatform) {
    return !getDisabledPlugins().has(pluginPlatform);
}

function setPluginEnabled(pluginPlatform, enabled) {
    const disabled = getDisabledPlugins();
    if (enabled) {
        disabled.delete(pluginPlatform);
    } else {
        disabled.add(pluginPlatform);
    }
    store.set("disabledPlugins", JSON.stringify([...disabled]));
}

function getUserVariables(pluginPlatform) {
    return parseJson(store.getString(`${pluginPlatform}.userVariables`), {});
}

function setUserVariables(pluginPlatform, userVariables) {
    store.set(`${pluginPlatform}.userVariables`, JSON.stringify(userVariables || {}));
}

module.exports = {
    getPluginOrder,
    setPluginOrder,
    isPluginEnabled,
    setPluginEnabled,
    getUserVariables,
    setUserVariables,
};
