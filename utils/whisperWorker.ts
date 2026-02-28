import { pipeline, env } from '@xenova/transformers';

// Tell transformers to get models from the public directory
env.allowLocalModels = true;
env.localModelPath = '/models/';
env.useBrowserCache = true;
env.useBrowserCache = true;

class PipelineSingleton {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny.en';
    static instance: any = null;

    static async getInstance(progress_callback?: any) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task as any, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.addEventListener('message', async (event) => {
    const { audioData } = event.data;

    try {
        const transcriber = await PipelineSingleton.getInstance((x: any) => {
            // Can fire progress events here
            self.postMessage({ status: 'progress', message: 'Loading model weights to browser...' });
        });

        self.postMessage({ status: 'progress', message: 'Model loaded. Transcribing speech to semantic sentences...' });

        const result = await transcriber(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: true
        });

        self.postMessage({ status: 'complete', result: result.chunks });
    } catch (e: any) {
        self.postMessage({ status: 'error', error: e.message });
    }
});
