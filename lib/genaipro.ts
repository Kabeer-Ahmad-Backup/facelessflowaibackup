// GenAIPro TTS API Client
// Docs: https://genaipro.vn/api/v1

interface GenAIProTaskResponse {
    task_id: string;
}

interface GenAIProTaskStatus {
    id: string;
    input: string;
    voice_id: string;
    model_id: string;
    style?: number;
    speed?: number;
    use_speaker_boost?: boolean;
    similarity?: number;
    stability?: number;
    created_at: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: string; // MP3 URL
    subtitle?: string; // SRT URL
}

const GENAIPRO_API_BASE = 'https://genaipro.vn/api/v1';
const MAX_RETRIES = 150; // 150 * 2s = 5 minutes max wait
const POLL_INTERVAL = 2000; // 2 seconds

async function makeGenAIProRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: any
) {
    const apiKey = process.env.GENAIPRO_API_KEY;
    if (!apiKey) {
        throw new Error('GENAIPRO_API_KEY not configured');
    }

    const url = `${GENAIPRO_API_BASE}${endpoint}`;
    const headers: HeadersInit = {
        'Authorization': `Bearer ${apiKey}`,
        ...(body && { 'Content-Type': 'application/json' })
    };

    const response = await fetch(url, {
        method,
        headers,
        ...(body && { body: JSON.stringify(body) })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GenAIPro API Error (${response.status}): ${errorText}`);
    }

    return response.json();
}

/**
 * Generate TTS audio using GenAIPro (ElevenLabs) API
 * @param text - Text to convert to speech
 * @param voiceId - GenAIPro voice ID
 * @param projectId - Project ID for file naming
 * @param sceneIndex - Scene index for file naming
 * @returns Audio URL and duration
 */
export async function generateGenAIProAudio(
    text: string,
    voiceId: string,
    projectId: string,
    sceneIndex: number
): Promise<{ url: string; duration: number }> {
    console.log(`[GenAIPro] Generating audio with voice ${voiceId}...`);

    // Step 1: Create TTS task
    const createResponse: GenAIProTaskResponse = await makeGenAIProRequest(
        '/labs/task',
        'POST',
        {
            input: text,
            voice_id: voiceId,
            model_id: 'eleven_multilingual_v2', // Good quality, multilingual
            style: 0.0,
            speed: 1.0,
            use_speaker_boost: true,
            similarity: 0.75,
            stability: 0.5
        }
    );

    const taskId = createResponse.task_id;
    console.log(`[GenAIPro] Task created: ${taskId}`);

    // Step 2: Poll for completion
    let retries = 0;
    let taskStatus: GenAIProTaskStatus;

    while (retries < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        taskStatus = await makeGenAIProRequest(`/labs/task/${taskId}`, 'GET');

        console.log(`[GenAIPro] Task status: ${taskStatus.status}`);

        if (taskStatus.status === 'completed') {
            if (!taskStatus.result) {
                throw new Error('Task completed but no audio URL returned');
            }

            // Download and calculate duration
            const audioResponse = await fetch(taskStatus.result);
            if (!audioResponse.ok) {
                throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
            }

            const audioBuffer = await audioResponse.arrayBuffer();
            const { parseBuffer } = await import('music-metadata');
            const metadata = await parseBuffer(Buffer.from(audioBuffer), { mimeType: 'audio/mpeg' });
            const duration = metadata.format.duration || 5;

            console.log(`[GenAIPro] ✅ Audio generated: ${taskStatus.result}, Duration: ${duration}s`);

            return {
                url: taskStatus.result,
                duration
            };
        }

        if (taskStatus.status === 'failed') {
            throw new Error('GenAIPro task failed');
        }

        retries++;
    }

    throw new Error('GenAIPro task timed out after 5 minutes');
}
