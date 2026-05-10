"use strict";

const internalSerializeKey = "$";
const localPluginPlatform = "本地";

function getMediaUniqueKey(mediaItem) {
    return `${mediaItem.platform}@${mediaItem.id}`;
}

function resetMediaItem(mediaItem, platform, newObj) {
    if (!mediaItem) {
        return mediaItem;
    }
    if (mediaItem.platform === localPluginPlatform || platform === localPluginPlatform) {
        return newObj ? { ...mediaItem } : mediaItem;
    }
    if (newObj) {
        return {
            ...mediaItem,
            platform: platform || mediaItem.platform,
            [internalSerializeKey]: undefined,
        };
    }
    mediaItem.platform = platform || mediaItem.platform;
    mediaItem[internalSerializeKey] = undefined;
    return mediaItem;
}

function getLocalPath(mediaItem) {
    if (!mediaItem) {
        return null;
    }
    if (
        typeof mediaItem.url === "string" &&
        (mediaItem.url.startsWith("file://") || mediaItem.url.startsWith("content://"))
    ) {
        return mediaItem.url;
    }
    return mediaItem[internalSerializeKey]?.localPath || mediaItem.localPath || null;
}

function addFileScheme(fileName) {
    if (typeof fileName === "string" && fileName.startsWith("/")) {
        return `file://${fileName}`;
    }
    return fileName;
}

module.exports = {
    internalSerializeKey,
    localPluginPlatform,
    addFileScheme,
    getLocalPath,
    getMediaUniqueKey,
    resetMediaItem,
};
