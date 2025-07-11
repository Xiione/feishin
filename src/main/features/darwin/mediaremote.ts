import MediaService from '@xiione/electron-media-service';
import { ipcMain } from 'electron';

import { getMainWindow } from '/@/main/index';
import { QueueSong } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

interface Metadata {
    album: string;
    albumArt: string;
    albumArtUrl: string;
    artist: string;
    currentTime: number;
    duration: number;
    id: number;
    state: 'paused' | 'playing' | 'stopped';
    title: string;
}

async function fetchImageToBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const bytes = new Uint8Array(await res.arrayBuffer());
    const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
    return `data:${contentType};base64,${btoa(binary)}`;
}

const mediaService = new MediaService();
const metadataEmpty: Metadata = {
    album: '',
    albumArt: '',
    albumArtUrl: '',
    artist: '',
    currentTime: 0,
    duration: 0,
    id: 0,
    state: 'stopped',
    title: '',
};
let metadataCur: Metadata = structuredClone(metadataEmpty);

mediaService.startService();

mediaService.on('pause', () => getMainWindow()?.webContents.send('renderer-player-pause'));

mediaService.on('play', () => getMainWindow()?.webContents.send('renderer-player-play'));

mediaService.on('playPause', () => getMainWindow()?.webContents.send('renderer-player-play-pause'));

mediaService.on('next', () => getMainWindow()?.webContents.send('renderer-player-next'));

mediaService.on('previous', () => getMainWindow()?.webContents.send('renderer-player-previous'));

// we're given milliseconds
mediaService.on('seek', (event: number) => {
    getMainWindow()?.webContents.send('request-seek', {
        offset: event / 1e3,
    });
});

ipcMain.on('update-position', (_event, arg: number) => {
    metadataCur.currentTime = arg * 1e3;
    mediaService.setMetaData(metadataCur);
});

ipcMain.on('mpris-update-seek', (_event, arg: number) => {
    metadataCur.currentTime = arg * 1e3;
    mediaService.setMetaData(metadataCur);
});

ipcMain.on('update-playback', (_event, status: PlayerStatus) => {
    metadataCur.state = status === PlayerStatus.PLAYING ? 'playing' : 'paused';
    mediaService.setMetaData(metadataCur);
});

ipcMain.on('update-song', async (_event, song: QueueSong | undefined) => {
    try {
        console.error(song);
        if (!song?.id) {
            metadataCur = structuredClone(metadataEmpty);
            mediaService.setMetaData(metadataCur);
            return;
        }

        let artUrl = song.imageUrl ?? '';

        if (song.imageUrl !== metadataCur.albumArtUrl) {
            if (song.imageUrl && !/^data:.*;base64,/.test(artUrl)) {
                try {
                    artUrl = await fetchImageToBase64(song.imageUrl);
                } catch (err) {
                    console.log('Failed to fetch album art via url', err);
                }
            }
        } else {
            artUrl = metadataCur.albumArt; // maintain same encoded art
        }

        metadataCur = {
            album: song.album ?? '',
            albumArt: artUrl,
            albumArtUrl: song.imageUrl ?? '',
            artist: song.artists?.length ? song.artists.map((a) => a.name).join(', ') : '',
            currentTime: metadataCur.currentTime,
            duration: song.duration ? Math.round(song.duration) : 0,
            id: 1,
            state: metadataCur.state,
            title: song.name ?? '',
        };
        mediaService.setMetaData(metadataCur);
    } catch (err) {
        console.log(err);
    }
});

export { mediaService };
