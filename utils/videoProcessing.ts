import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// 1. Audio Extraction & STT (Worker-based)
export async function transcribeVideo(file: File, updateProgress: (msg: string) => void): Promise<any[]> {
    updateProgress('Extracting audio track for transcription...');

    // We need 16kHz audio for Whisper
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    let audioData;
    if (audioBuffer.numberOfChannels === 2) {
        // Mixdown stereo to mono
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        audioData = new Float32Array(left.length);
        for (let i = 0; i < left.length; ++i) {
            audioData[i] = (left[i] + right[i]) / 2;
        }
    } else {
        audioData = audioBuffer.getChannelData(0);
    }

    return new Promise((resolve, reject) => {
        updateProgress('Initializing AI background worker...');

        const worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (event) => {
            const { status, message, result, error } = event.data;
            if (status === 'progress') {
                if (message) updateProgress(message);
            } else if (status === 'complete') {
                worker.terminate();
                resolve(result);
            } else if (status === 'error') {
                worker.terminate();
                reject(new Error(error));
            }
        };

        worker.postMessage({ audioData }, [audioData.buffer]);
    });
}

// 2. FFmpeg Slicing
export async function sliceVideo(
    file: File,
    chunks: any[],
    updateProgress: (msg: string) => void
): Promise<{ text: string; blob: Blob; duration: number }[]> {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const inputName = 'input_video' + file.name.substring(file.name.lastIndexOf('.'));
    const slicedScenes: { text: string; blob: Blob; duration: number }[] = [];

    let ffmpeg: FFmpeg;

    const loadFfmpeg = async () => {
        updateProgress('Loading FFmpeg engine...');
        const f = new FFmpeg();

        try {
            await f.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
        } catch (e: any) {
            console.error('FFmpeg Load Error:', e);
            throw new Error(`Failed to load FFmpeg WASM Web Worker: ${e?.message || e}`);
        }

        try {
            console.log('Writing file to WASM FS...', inputName);
            f.writeFile(inputName, await fetchFile(file));
        } catch (e: any) {
            console.error('FFmpeg WriteFile Error:', e);
            throw new Error(`Failed to write file to WASM FS: ${e?.message || e}`);
        }
        return f;
    };

    ffmpeg = await loadFfmpeg();

    const RECYCLE_EVERY_N_CHUNKS = 50;

    for (let i = 0; i < chunks.length; i++) {
        // memory reset logic to prevent WASM C++ heap fragmentation
        if (i > 0 && i % RECYCLE_EVERY_N_CHUNKS === 0) {
            updateProgress(`Recycling ML memory (Chunk ${i})...`);
            try { ffmpeg.terminate(); } catch (e) { }
            ffmpeg = await loadFfmpeg();
        }

        updateProgress(`Slicing semantic scene ${i + 1} of ${chunks.length}...`);

        const chunk = chunks[i];
        const start = chunk.timestamp[0];
        const end = chunk.timestamp[1] || start + 5; // fallback duration if end missing
        const duration = end - start;

        if (duration < 1.0) continue; // skip tiny slivers

        const outputName = `scene_${i}.mp4`;

        try {
            await ffmpeg.exec([
                '-ss', `${start}`,
                '-t', `${duration}`,
                '-i', inputName,
                '-c', 'copy',
                outputName
            ]);
        } catch (e: any) {
            console.error('FFmpeg Exec Error at chunk', i, e);
            throw new Error(`Failed to execute FFmpeg command at chunk ${i}: ${e?.message || e}`);
        }

        let data;
        try {
            data = await ffmpeg.readFile(outputName);
        } catch (e: any) {
            console.error('FFmpeg ReadFile Error at chunk', i, e);
            throw new Error(`Failed to read file from WASM FS at chunk ${i}: ${e?.message || e}`);
        }

        const blob = new Blob([new Uint8Array(data as any)], { type: 'video/mp4' });

        // CRITICAL FOR MEMORY: Delete the clip from the WASM virtual file system 
        // immediately after we construct the Blob in regular JS memory!
        try {
            ffmpeg.deleteFile(outputName);
        } catch (cleanupErr) {
            console.warn(`Could not cleanup WASM file ${outputName}`, cleanupErr);
        }

        slicedScenes.push({
            text: chunk.text.trim(),
            blob,
            duration
        });
    }

    updateProgress('Video slicing complete. Cleaning up resources...');
    // Clean up WASM memory
    try {
        ffmpeg.deleteFile(inputName);
    } catch (e) { }

    try {
        // Safe terminate wrapper
        ffmpeg.terminate();
    } catch (e) { }

    return slicedScenes;
}

import { getSignedUploadUrl } from '@/actions/uploadMediaChunk';
import { createClient } from '@/utils/supabase/client';

// 3. Upload to Supabase using Signed URLs to bypass Next.js API chunk limits
export async function uploadSlices(
    projectId: string,
    slices: { text: string; blob: Blob; duration: number }[],
    updateProgress: (msg: string) => void
): Promise<{ text: string; url: string; duration: number }[]> {
    const supabase = createClient();
    const uploadedScenes: { text: string; url: string; duration: number }[] = [];

    for (let i = 0; i < slices.length; i++) {
        updateProgress(`Uploading generated slice ${i + 1} of ${slices.length}...`);
        const slice = slices[i];

        const fileName = `${projectId}/avatar_${Date.now()}_${i}.mp4`;

        try {
            // 1. Get the Signed URL token strictly bypassing RLS via Admin Key
            const { token, url } = await getSignedUploadUrl(fileName);

            // 2. Upload the Blob directly from browser to Supabase bypassing Next.js API bottleneck
            const { error } = await supabase.storage
                .from('projects')
                .uploadToSignedUrl(fileName, token, slice.blob);

            if (error) {
                throw new Error(error.message);
            }

            uploadedScenes.push({
                text: slice.text,
                url: url,
                duration: slice.duration
            });
        } catch (e: any) {
            console.error('Failed to upload slice', e);
            throw new Error(`Failed to safely upload media chunk ${i}: ${e.message}`);
        }
    }

    return uploadedScenes;
}
