"use strict";

const path = require("path");
const { JsonStore } = require("./jsonStore");
const { paths } = require("./paths");
const { getMediaUniqueKey } = require("./media");

const store = new JsonStore(path.join(paths.cachePath, "media-cache.json"));

function safeParse(raw) {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function getMediaCache(mediaItem) {
    if (!mediaItem?.platform || !mediaItem?.id) {
        return null;
    }
    return safeParse(store.getString(getMediaUniqueKey(mediaItem)));
}

function setMediaCache(mediaItem) {
    if (!mediaItem?.platform || !mediaItem?.id) {
        return false;
    }
    store.set(getMediaUniqueKey(mediaItem), JSON.stringify(mediaItem));
    return true;
}

function removeMediaCache(mediaItem) {
    if (!mediaItem?.platform || !mediaItem?.id) {
        return false;
    }
    store.delete(getMediaUniqueKey(mediaItem));
    return true;
}

module.exports = {
    getMediaCache,
    setMediaCache,
    removeMediaCache,
};
