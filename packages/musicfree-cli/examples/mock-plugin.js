"use strict";

module.exports = {
    platform: "MockMusic",
    version: "0.0.1",
    author: "MusicFree CLI",
    description: "A tiny plugin for CLI smoke tests.",
    supportedSearchType: ["music", "album", "sheet", "lyric"],
    defaultSearchType: "music",

    async search(query, page, type) {
        if (type === "lyric") {
            return {
                isEnd: true,
                data: [
                    {
                        id: `lyric-${query}-${page}`,
                        platform: "MockMusic",
                        title: query,
                        artist: "CLI",
                        rawLrc: "[00:00.00]MusicFree CLI",
                    },
                ],
            };
        }

        return {
            isEnd: true,
            data: [
                {
                    id: `${type}-${query}-${page}`,
                    platform: "MockMusic",
                    title: query,
                    artist: "CLI Artist",
                    album: "CLI Album",
                    artwork: "",
                    duration: 180,
                    url: "https://example.com/mock.mp3",
                },
            ],
        };
    },

    async getMediaSource(musicItem, quality) {
        return {
            url: musicItem.url || "https://example.com/mock.mp3",
            quality,
        };
    },

    async getLyric() {
        return {
            rawLrc: "[00:00.00]MusicFree CLI MVP",
        };
    },

    async importMusicItem(urlLike) {
        return {
            id: urlLike,
            platform: "MockMusic",
            title: "Imported Song",
            artist: "CLI Artist",
            album: "CLI Album",
            artwork: "",
            duration: 120,
            url: "https://example.com/imported.mp3",
        };
    },

    async importMusicSheet() {
        return [
            {
                id: "sheet-song-1",
                platform: "MockMusic",
                title: "Sheet Song",
                artist: "CLI Artist",
                album: "CLI Album",
                artwork: "",
                duration: 120,
                url: "https://example.com/sheet-song.mp3",
            },
        ];
    },
};
