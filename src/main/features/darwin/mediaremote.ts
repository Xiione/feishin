// @ts-ignore
import MediaService from 'electron-media-service';
import { ipcMain } from 'electron';
// import Player from 'mpris-service';
import { PlayerStatus } from '../../../renderer/types';
import { getMainWindow } from '../../main';
import { QueueSong } from '/@/renderer/api/types';

async function fetchImageToBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    return `data:${contentType};base64,${base64Data}`;
}

interface Metadata {
    album: string;
    albumArt: string;
    albumArtUrl: string;
    artist: string;
    currentTime: number;
    duration: number;
    id: number;
    state: 'playing' | 'paused' | 'stopped';
    title: string;
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
        if (!song?.id) {
            metadataCur = structuredClone(metadataEmpty);
            mediaService.setMetaData(metadataCur);
            return;
        }

        const base64Url =
            song.imageUrl !== metadataCur.albumArtUrl
                ? song.imageUrl
                    ? await fetchImageToBase64(song.imageUrl)
                    : ''
                : metadataCur.albumArt;
        metadataCur = {
            title: song.name ?? '',
            artist: song.artists?.length ? song.artists.map((a) => a.name).join(', ') : '',
            album: song.album ?? '',
            albumArt: base64Url,
            albumArtUrl: song.imageUrl ?? '',
            state: metadataCur.state,
            id: 1,
            currentTime: metadataCur.currentTime,
            duration: song.duration ? Math.round(song.duration) : 0,
        };
        mediaService.setMetaData(metadataCur);
    } catch (err) {
        console.log(err);
    }
});

export { mediaService };
