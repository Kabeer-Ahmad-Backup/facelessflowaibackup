// Google Imagen 4.0 Image Generation
// Uses imagen-4.0-generate-001 model with @google/genai SDK

import { GoogleGenAI, PersonGeneration } from '@google/genai';
import { uploadToStorage } from './ai';

export async function generateImagenImage(prompt: string, projectId: string, sceneIndex: number, aspectRatio: string = '16:9'): Promise<string> {
    const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY!
    });

    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-fast-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                aspectRatio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : aspectRatio === '3:4' ? '3:4' : aspectRatio === '4:3' ? '4:3' : '16:9',
                personGeneration: PersonGeneration.ALLOW_ALL
            }
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const generatedImage = response.generatedImages[0];
            if (!generatedImage.image?.imageBytes) {
                throw new Error("No image bytes in response");
            }

            const imageBytes = generatedImage.image.imageBytes;
            const buffer = Buffer.from(imageBytes, 'base64');

            // Upload to Supabase storage
            return await uploadToStorage(
                buffer,
                projectId,
                `images/scene_${sceneIndex}_${Date.now()}.png`,
                'image/png'
            );
        }
    } catch (e: any) {
        console.error("Imagen 4.0 Error:", e);
        throw new Error(`Imagen 4.0 Gen Failed: ${e.message}`);
    }

    throw new Error("No image data returned from Imagen 4.0");
}
