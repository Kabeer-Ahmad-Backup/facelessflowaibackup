import { createClient } from '@supabase/supabase-js';
import { Runware, IRequestImage } from '@runware/sdk-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Replicate from 'replicate';

// Initialize Admin Client for Storage Uploads (Bypassing RLS for simpler server-side upload)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);


export async function uploadToStorage(buffer: ArrayBuffer | Buffer, projectId: string, filename: string, contentType: string) {
    const path = `${projectId}/${filename}`;
    const { data, error } = await supabaseAdmin.storage
        .from('assets')
        .upload(path, buffer, {
            contentType,
            upsert: true
        });

    if (error) throw error;

    const { data: { publicUrl } } = supabaseAdmin.storage.from('assets').getPublicUrl(path);
    return publicUrl;
}

import { parseBuffer } from 'music-metadata';

import keyRotation from './keyRotation';

export async function generateMinimaxAudio(text: string, voiceId: string = "male-qn-qingse", projectId: string, sceneIndex: number): Promise<{ url: string, duration: number }> {
    // Use retry wrapper with key rotation
    return await keyRotation.withRetry(
        async (apiKey) => {
            // Get GroupID from keyRotation (extracted once from primary key during initialization)
            let groupId = keyRotation.getMinimaxGroupId();

            if (!groupId) {
                throw new Error("MINIMAX_GROUP_ID is missing. Please set MINIMAX_GROUP_ID env variable or ensure primary MINIMAX_API_KEY is a JWT token.");
            }

            const url = "https://api.minimax.io/v1/t2a_v2?GroupId=" + groupId;

            const payload = {
                "model": "speech-01-turbo",
                "text": text,
                "stream": false,
                "voice_setting": {
                    "voice_id": voiceId,
                    "speed": 1.0,
                    "vol": 1.0,
                    "pitch": 0
                },
                "audio_setting": {
                    "sample_rate": 32000,
                    "bitrate": 128000,
                    "format": "mp3",
                    "channel": 1
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Minimax API Error: ${response.status} ${await response.text()}`);
            }

            const data = await response.json();
            if (data.base_resp?.status_code !== 0) {
                throw new Error(`Minimax API Logic Error: ${data.base_resp?.status_msg}`);
            }

            // Minimax returns hex string of audio data
            let hexAudio = data.data?.audio || data.audio;

            // If it returns a URL (rare for this endpoint but possible)
            if (!hexAudio && (data.data?.audio_url || data.audio_url)) {
                const audioUrl = data.data?.audio_url || data.audio_url;
                const audioResp = await fetch(audioUrl);
                const arrayBuffer = await audioResp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const metadata = await parseBuffer(buffer, 'audio/mpeg');
                const duration = metadata.format.duration || 5;

                const publicUrl = await uploadToStorage(
                    buffer,
                    projectId,
                    `audio/scene_${sceneIndex}_${Date.now()}.mp3`,
                    'audio/mpeg'
                );
                return { url: publicUrl, duration };
            }

            if (!hexAudio) {
                console.error("Minimax Response", data);
                throw new Error("No audio data received from Minimax");
            }

            // Convert Hex to Buffer
            const buffer = Buffer.from(hexAudio, 'hex');

            // Parse Duration
            const metadata = await parseBuffer(buffer, 'audio/mpeg');
            const duration = metadata.format.duration || 5;

            // Upload
            const publicUrl = await uploadToStorage(
                buffer,
                projectId,
                `audio/scene_${sceneIndex}_${Date.now()}.mp3`,
                'audio/mpeg'
            );
            return { url: publicUrl, duration };
        },
        () => keyRotation.getNextMinimaxKey()
    );
}

export async function generateFalImage(prompt: string, projectId: string, sceneIndex: number, aspectRatio: string = '16:9'): Promise<string> {
    // Using fal-ai/recraft-v3 or flux as per modern standards, mimicking python's fal logic
    // Python used: "fal-ai/flux-pro/v1.1-ultra" or similar.
    const url = "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra";

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${process.env.FAL_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: prompt,
            aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
            safety_tolerance: "2"
        })
    });

    if (!response.ok) {
        throw new Error(`Fal Queue Error: ${response.status}`);
    }

    const queueData = await response.json();
    const requestId = queueData.request_id;

    // Poll for result
    let finalUrl = null;
    let attempts = 0;
    while (!finalUrl && attempts < 40) {
        await new Promise(r => setTimeout(r, 2000));

        // Flux Pro v1.1 Ultra usually provides a status_url, or we check /requests/{id}
        // The error 405 on /status suggests we should check the root request endpoint
        const pollUrl = `https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/${requestId}`;

        const statusDetails = await fetch(pollUrl, {
            headers: { 'Authorization': `Key ${process.env.FAL_KEY}` }
        });

        if (!statusDetails.ok) {
            console.warn(`Fal Polling Error: ${statusDetails.status}`);
            attempts++;
            continue;
        }

        const statusJson = await statusDetails.json();
        console.log(`[Fal Status ${requestId}]`, statusJson.status);

        if (statusJson.status === 'COMPLETED') {
            if (statusJson.images && statusJson.images.length > 0) {
                finalUrl = statusJson.images[0].url;
            } else {
                // Sometimes result is in a separate field or response_url
                const responseUrl = statusJson.response_url;
                if (responseUrl) {
                    const finalData = await (await fetch(responseUrl, { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` } })).json();
                    finalUrl = finalData.images[0].url;
                }
            }
        } else if (statusJson.status === 'FAILED') {
            throw new Error(`Fal Image Generation Failed: ${JSON.stringify(statusJson.error)}`);
        }
        attempts++;
    }

    if (!finalUrl) throw new Error("Fal Timeout");

    // Download and Re-upload to Supabase (to persist it)
    const imgResp = await fetch(finalUrl);
    const imgBuffer = await imgResp.arrayBuffer();

    return await uploadToStorage(
        imgBuffer,
        projectId,
        `images/scene_${sceneIndex}_${Date.now()}.jpg`,
        'image/jpeg'
    );
}

export async function generateRunwareImage(prompt: string, projectId: string, sceneIndex: number, aspectRatio: string = '16:9', modelId?: string, referenceImageId?: string): Promise<string> {
    // Use retry wrapper with key rotation
    return await keyRotation.withRetry(
        async (apiKey) => {
            const runware = new Runware({ apiKey });

            // Calculate dimensions based on aspect ratio
            let width, height;
            if (aspectRatio === '9:16') {
                width = 768;
                height = 1344;
            } else if (aspectRatio === '1:1') {
                width = 1024;
                height = 1024;
            } else { // 16:9 default
                width = 1344;
                height = 768;
            }

            console.log(`Generating Runware image with dimensions: ${width}x${height} (${aspectRatio}) using model ${modelId || "runware:100@1"}`);
            if (referenceImageId) console.log(`Using Reference Image: ${referenceImageId}`);

            let effectiveReferenceImageId = referenceImageId;

            // Handle local file paths (starting with /)
            if (referenceImageId && referenceImageId.startsWith('/')) {
                try {
                    // Build full URL for HTTP fetch
                    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
                        (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
                        'http://localhost:3000';

                    const imageUrl = `${baseUrl}${referenceImageId}`;
                    console.log(`Fetching reference image via HTTP: ${imageUrl}`);

                    const imageResponse = await fetch(imageUrl);
                    if (!imageResponse.ok) {
                        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
                    }

                    const imageBuffer = await imageResponse.arrayBuffer();
                    const base64Image = Buffer.from(imageBuffer).toString('base64');
                    const contentType = imageResponse.headers.get('content-type') || 'image/png';
                    const dataUri = `data:${contentType};base64,${base64Image}`;

                    const uploadResult = await runware.imageUpload({ image: dataUri });

                    if (uploadResult && uploadResult.imageUUID) {
                        console.log(`Uploaded Reference Image UUID: ${uploadResult.imageUUID}`);
                        effectiveReferenceImageId = String(uploadResult.imageUUID);
                    } else {
                        console.warn("Runware Upload Failed or returned no UUID", uploadResult);
                    }
                } catch (uploadError) {
                    console.error("Failed to upload reference image via HTTP:", uploadError);
                }
            }

            const results = await runware.imageInference({
                positivePrompt: prompt,
                model: modelId || "runware:100@1",
                width,
                height,
                numberResults: 1,
                ...(effectiveReferenceImageId ? {
                    referenceImages: [effectiveReferenceImageId]
                } : {})
            });

            if (results && results.length > 0 && results[0].imageURL) {
                const finalUrl = results[0].imageURL;
                const imgResp = await fetch(finalUrl);
                const imgBuffer = await imgResp.arrayBuffer();
                return await uploadToStorage(
                    Buffer.from(imgBuffer),
                    projectId,
                    `images/scene_${sceneIndex}_${Date.now()}.jpg`,
                    'image/jpeg'
                );
            }
            throw new Error("No image returned from Runware");
        },
        () => keyRotation.getNextRunwareKey()
    );
}


export async function generateGeminiImage(prompt: string, projectId: string, sceneIndex: number, aspectRatio: string = '16:9'): Promise<string> {
    // Using Google Generative AI Node SDK for gemini-2.5-flash-image (Experimental/Multimodal)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: {
                    aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9'
                }
            } as any // Type assertion for experimental responseModalities API
        });

        const response = result.response;

        // Try multiple ways to access parts (SDK structure varies)
        // @ts-ignore
        const parts = response.parts || response.candidates?.[0]?.content?.parts;

        if (parts && parts.length > 0) {
            for (const part of parts) {
                // @ts-ignore
                if (part.inlineData && part.inlineData.data) {
                    // @ts-ignore
                    const base64Image = part.inlineData.data;
                    const buffer = Buffer.from(base64Image, 'base64');

                    return await uploadToStorage(
                        buffer,
                        projectId,
                        `images/scene_${sceneIndex}_${Date.now()}.jpg`,
                        'image/jpeg'
                    );
                }
            }
        }
    } catch (e: any) {
        console.error("Gemini 2.5 Flash Image Error:", e);
        throw new Error(`Gemini 2.5 Flash Gen Failed: ${e.message}`);
    }

    throw new Error("No image data returned from Gemini 2.5 Flash");
}

export async function generateReplicateImage(
    prompt: string,
    aspectRatio: string = '16:9',
    projectId: string,
    sceneIndex: number
): Promise<string> {
    const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
    });

    console.log(`[Replicate] Generating image with James Finetuned model...`);

    // Map aspect ratios
    let replicateAspectRatio = '16:9';
    if (aspectRatio === '9:16') replicateAspectRatio = '9:16';
    else if (aspectRatio === '1:1') replicateAspectRatio = '1:1';

    const output = await replicate.run(
        "vivian948/flux-dev-lora:f1085d99b920f1195a80d3197fd9635407cce557ac24e9363e74d9cd0fa17351",
        {
            input: {
                prompt,
                model: "dev",
                aspect_ratio: replicateAspectRatio,
                go_fast: false,
                lora_scale: 1,
                megapixels: "1",
                num_outputs: 1,
                output_format: "webp",
                guidance_scale: 3,
                output_quality: 80,
                prompt_strength: 0.8,
                extra_lora_scale: 1,
                num_inference_steps: 28
            }
        }
    ) as any;

    console.log(`[Replicate] Image generated successfully`);

    // Output is an array of URLs
    if (output && output.length > 0) {
        const imageUrl = output[0];

        // Download and upload to Supabase storage
        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();

        const uploadedUrl = await uploadToStorage(
            buffer,
            projectId,
            `images/scene_${sceneIndex}_${Date.now()}.webp`,
            'image/webp'
        );

        return uploadedUrl;
    }

    throw new Error("No image returned from Replicate");
}
