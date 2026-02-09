'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { SceneApi, ProjectSettings } from '@/types';
import { generateMinimaxAudio, generateFalImage, generateRunwareImage, generateGeminiImage } from '@/lib/ai';
import { generateGenAIProAudio } from '@/lib/genaipro';
import { generateImagenImage } from '@/lib/imagen';
import { VOICE_ID_MAP, CHARACTER_REFERENCE_MAP } from '@/lib/constants';

// Admin client for bypass if needed
const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

import keyRotation from '@/lib/keyRotation';

// Dynamic OpenAI client creation with rotated key
function getOpenAIClient(apiKey: string) {
    return new OpenAI({ apiKey });
}

export type GenerateSceneResult = {
    success: boolean;
    scene?: SceneApi;
    error?: string;
    creditsRemaining?: number;
};

export async function generateScene(
    projectId: string,
    sceneIndex: number,
    text: string,
    settings: ProjectSettings,
): Promise<GenerateSceneResult> {
    console.log(`Generating Scene ${sceneIndex} for Project ${projectId}`);

    try {
        const supabase = await createClient();

        // 1. Get User from Session
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            throw new Error("Unauthorized");
        }
        const userId = user.id;

        // 2. Check Credits
        const { data: profile } = await supabase
            .from('profiles')
            .select('credits')
            .eq('id', userId)
            .single();

        if (!profile || profile.credits < 1) {
            throw new Error("Insufficient credits");
        }

        // 3. Check for Existing Scene by order_index (for Continue/Fix scenarios)
        const { data: existingScenes } = await supabase
            .from('scenes')
            .select()
            .eq('project_id', projectId)
            .eq('order_index', sceneIndex);

        let newScene: SceneApi;

        if (existingScenes && existingScenes.length > 0) {
            // Update existing scene
            console.log(`Updating existing scene at index ${sceneIndex}`);
            const { data: updatedScene, error: updateError } = await supabase
                .from('scenes')
                .update({
                    text,
                    status: 'pending'
                })
                .eq('id', existingScenes[0].id)
                .select()
                .single();

            if (updateError) throw updateError;
            newScene = updatedScene as SceneApi;
        } else {
            // Insert new scene
            console.log(`Creating new scene at index ${sceneIndex}`);
            const { data: insertedScene, error: initError } = await supabase
                .from('scenes')
                .insert({
                    project_id: projectId,
                    order_index: sceneIndex,
                    text,
                    status: 'pending'
                })
                .select()
                .single();

            if (initError) throw initError;
            newScene = insertedScene as SceneApi;
        }

        try {

            // 4. Generate Simple Scene Description (OpenAI)
            const baseInstructions = `You are a visual storyteller creating storyboard frames. For each sentence below, keeping context of the previous sentences in mind, create ONE image prompt that visually represents the exact moment described. 
            
RULES:
- Focus on the PRIMARY action happening in the sentence
- Clearly show who is doing what, where, and why
- Describe physical actions, posture, environment, and interactions
- Use clear, concrete objects, people, and actions
- Do NOT add ideas, symbolism, or events not stated in the sentence
- Keep prompts simple and focused
- Do NOT include style instructions, camera terms, or negative prompts
- Describe WHAT is visible in the frame, not HOW it is drawn

Output format: Return ONLY a valid JSON array of strings, containing exactly one string for the one sentence provided.`;

            // 4. Generate Simple Scene Description (OpenAI) with retry
            const promptResponse = await keyRotation.withRetry(
                async (apiKey) => {
                    const openai = getOpenAIClient(apiKey);
                    return await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [{
                            role: "system",
                            content: baseInstructions
                        }, {
                            role: "user",
                            content: `Sentence: "${text}"`
                        }]
                    });
                },
                () => keyRotation.getNextOpenAIKey()
            );

            // Parse Response
            let simplePrompt = text;
            try {
                const content = promptResponse.choices[0].message.content || "";
                const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanContent);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    simplePrompt = parsed[0];
                } else if (typeof parsed === 'string') {
                    simplePrompt = parsed; // Fallback if single string returned
                }
            } catch (e) {
                console.warn("Failed to parse OpenAI JSON, using raw text", e);
                simplePrompt = promptResponse.choices[0].message.content || text;
            }

            // 5. Build Full Styled Prompt
            const styleMode = settings.visualStyle;
            let styleDesc = "";
            let subjectDesc = "";
            let negativePrompt = "";

            if (styleMode === "normal" || styleMode === "stock_natural") {
                styleDesc = "Style: Cinematic, photorealistic, 8k, high-quality, beautiful, everyday life, humanistic, natural lighting.";
                subjectDesc = "Subject: Modern everyday life or general cinematic visuals.";
                negativePrompt = "text, logos, writing, letters, words, watermarks";
            } else if (styleMode === "stick") {
                styleDesc = "Style: Minimalist stick figure drawing, hand-drawn sketch style, black ink on white paper, simple lines.";
                subjectDesc = "Subject: Simple stick figures, very abstract and funny/cute.";
                negativePrompt = "text, realistic, detailed";
            } else if (styleMode === "health") {
                styleDesc = "Style: Clean semi-realistic medical illustration, medical explainer animation style, smooth vector-like digital shading, simplified anatomy with clear forms, flat-to-soft gradient coloring, high clarity illustration, educational medical artwork, controlled color palette with strong reds for affected areas, stylized skin without pores or fine texture, crisp edges, graphic clarity, balanced lighting, no cinematic shadows, professional medical visualization, YouTube health animation thumbnail style, simple blue flat background.";
                subjectDesc = "Subject: Medical or health-related visuals.";
                negativePrompt = "photorealistic, realism, photograph, painterly, oil painting, concept art, cinematic lighting, dramatic shadows, skin pores, wrinkles, fine detail, emotional expression, facial realism, 3D render, hyperrealistic, grain, noise, text, letters, arrows, labels";
            } else if (styleMode === "cartoon" || styleMode === "stock_vector") {
                styleDesc = "Style: Vector illustration, instructional vector illustration, thin clean line art, rounded shapes, pastel colors, no shading, simple indoor background.";
                subjectDesc = "Subject: Friendly, simple vector characters in everyday situations.";
                negativePrompt = "photo, realistic, 3d, photograph, photorealistic, realism, CGI, render, dramatic lighting, shadows, texture";
            } else if (styleMode === "art" || styleMode === "stock_art") {
                styleDesc = "Style: 1950s pop art illustration, retro comic illustration, bold black outlines, flat saturated colors, halftone dots, yellow background.";
                subjectDesc = "Subject: Vintage pop art.";
                negativePrompt = "photo, realistic, 3d, modern, photograph, photorealistic, realism, CGI, render, soft shading, gradients";
            } else if (styleMode === "clean_illustration") {
                styleDesc = "Style: clean narrative illustration, modern editorial illustration style, realistic human proportions, adult characters only (ages 25–90), mature facial features, soft painted shading with gentle shadows, clean linework (not cartoon), natural adult anatomy, detailed but uncluttered environment, storytelling illustration look.";
                subjectDesc = "Subject: Adult characters in modern narrative settings.";
                negativePrompt = "child, children, kid, kids, toddler, baby, teen, teenager, cartoon, vector, flat, anime, chibi, 3d, cgi, text";
            } else if (styleMode === "reference_image") {
                // User-provided strict prompt template
                styleDesc = `Role: You are an expert storyboard artist generating high-fidelity visual frames for a modern animated video series. Do NOT add any text to images.

1. Character Identity Consistency:
Reference Usage: Use the provided image strictly as a visual identity reference ONLY.
Identity Lock: Preserve the same character identity — face shape, facial features, body style, proportions, line weight, and overall illustration language.
Pose Freedom: The character’s posture, gesture, body orientation, and camera angle MUST change naturally to match the described scene and action.
Emotion Mapping: Convey emotion through body language and minimal facial changes without adding realistic or detailed facial features.

2. Scene Accuracy & World Building:
Scene Priority: The visual scene must directly and literally represent the described action or moment.
Environment: Always generate a fully realized environment relevant to the scene (interiors, streets, nature, objects, props). Never use blank, white, or abstract backgrounds.
Interaction: The character should physically interact with the environment when applicable (sitting, walking, holding, reaching, observing).

3. Composition & Framing:
Aspect Ratio: Cinematic 16:9 framing.
Camera Logic: Choose framing (wide, medium, close-up) that best communicates the scene’s emotion and action.
Depth & Separation: Use lighting, contrast, and foreground/background elements to clearly separate the character from the environment.
Style: Modern 2D vector illustration.
Visual Language: Flat colors, clean smooth outlines, soft cel-shaded lighting, no textures or noise.
Quality Target: Sharp, high-contrast visuals suitable for 4K animated video pipelines.
No text in image.`;

                subjectDesc = ""; // Handled by reference image and prompt context
                negativePrompt = "text, watermark, extra limbs, distorted face, noise, grainy";
            } else if (styleMode === "thick_stick_color") {
                styleDesc = "Style: simple old age human stick figure pictogram, head and limbs only, very simplified torso shape, arms and legs as thick solid rounded rods, rounded limb ends, solid filled shapes not outlines, minimal facial features, flat vector illustration, simple color fills, colored clothing blocks (shirt and pants as simple shapes), limited color palette, friendly abstract style, white background, no shading, no texture";
                subjectDesc = "Subject: Thick old age stick figure pictograms in simple colors";
                negativePrompt = "realistic anatomy, detailed body, thin limbs, single line drawing, sketch, ink, pencil, line art, outline only, comic style, cartoon character, childrens illustration, detailed clothing folds, textures text";
            } else if (styleMode === "thick_stick_bw") {
                styleDesc = "Style: simple old age human stick figure pictogram, head and limbs only, no detailed torso, arms and legs as thick solid rods, rounded limb ends, solid filled shapes not lines, minimal facial features or no face, instructional diagram style, ISO safety icon style, flat vector symbol, very minimal detail, no clothing, no anatomy, white background";
                subjectDesc = "Subject: Black and white thick old agestick figure symbols";
                negativePrompt = "cartoon character, childrens illustration, human anatomy, body proportions, clothing, shirt, pants, realistic, sketch, line drawing, outline only, thin lines, comic style text";
            } else { // zen
                styleDesc = "Style: Cinematic, photorealistic, 8k, high-quality, beautiful, everyday life, humanistic, serene lighting.";
                subjectDesc = "Subject: Zen Buddhist monk in orange robes/clothes.";
                negativePrompt = "text, logos, writing, cluttered";
            }

            const fullPrompt = `${simplePrompt} ${styleDesc} ${subjectDesc} NO TEXT IN THE IMAGE. Negative: ${negativePrompt}`;

            // 6. Generate Audio (Minimax)
            let targetVoiceId = settings.audioVoice;
            if (VOICE_ID_MAP[settings.audioVoice]) {
                targetVoiceId = VOICE_ID_MAP[settings.audioVoice];
            }

            console.log(`Generating Audio with Voice ID: ${targetVoiceId}`);
            let audioUrl = "";
            let audioDuration = 5;
            try {
                // Check if voice is from GenAIPro (prefix: genaipro_)
                if (targetVoiceId.startsWith('genaipro_')) {
                    const actualVoiceId = targetVoiceId.replace('genaipro_', '');
                    console.log(`Using GenAIPro provider with voice: ${actualVoiceId}`);
                    const audioResult = await generateGenAIProAudio(text, actualVoiceId, projectId, sceneIndex);
                    audioUrl = audioResult.url;
                    audioDuration = audioResult.duration;
                } else {
                    // Use Minimax for default voices
                    console.log(`Using Minimax provider with voice: ${targetVoiceId}`);
                    const audioResult = await generateMinimaxAudio(text, targetVoiceId, projectId, sceneIndex);
                    audioUrl = audioResult.url;
                    audioDuration = audioResult.duration;
                }
            } catch (e: any) {
                console.error("Audio Generation Failed:", e);
                throw new Error(`Audio Gen Failed: ${e.message}`);
            }

            // 7. Check for Stock Video (Stock+AI_Natural Mode)
            let mediaType: 'image' | 'video' = 'image';
            let attribution: string | null = null;
            let stockVideoUrl: string | null = null;
            let imageUrl = "";

            if ((settings.visualStyle === 'stock_natural' || settings.visualStyle === 'stock_vector' || settings.visualStyle === 'stock_art') && (sceneIndex % 2 === 0)) {
                // Check usage limit (200 stock videos per project)
                const { count } = await supabase
                    .from('scenes')
                    .select('*', { count: 'exact', head: true })
                    .eq('project_id', projectId)
                    .eq('media_type', 'video');

                if ((count || 0) < 200) {
                    // Try to fetch stock video
                    console.log(`Attempting to fetch Pexels video for: "${simplePrompt}"`);
                    const { searchPexelsVideo } = await import('@/lib/pexels');
                    const orientation = settings.aspectRatio === '9:16' ? 'portrait' : 'landscape';
                    const pexelsResult = await searchPexelsVideo(simplePrompt, orientation);

                    if (pexelsResult) {
                        console.log(`Found Pexels video: ${pexelsResult.url}`);
                        stockVideoUrl = pexelsResult.url;
                        mediaType = 'video';
                        attribution = pexelsResult.attribution;
                    } else {
                        console.log("No Pexels video found, falling back to AI image.");
                    }
                }
            }

            // 8. Generate Image or Use Stock
            if (mediaType === 'image') {
                console.log(`Generating Image with Model: ${settings.imageModel || 'fal'}`);
                try {
                    if (settings.imageModel === 'imagen') {
                        try {
                            imageUrl = await generateImagenImage(fullPrompt, projectId, sceneIndex, settings.aspectRatio);
                        } catch (imagenError: any) {
                            console.warn('Imagen failed, falling back to Gemini:', imagenError.message);
                            imageUrl = await generateGeminiImage(fullPrompt, projectId, sceneIndex, settings.aspectRatio);
                        }
                    } else if (settings.imageModel === 'gemini') {
                        imageUrl = await generateGeminiImage(fullPrompt, projectId, sceneIndex, settings.aspectRatio);
                    } else if (settings.imageModel === 'runware' || settings.visualStyle === 'reference_image') {
                        // Enforce 400@1 for reference_image, otherwise 100@1
                        const modelId = settings.visualStyle === 'reference_image' ? "runware:400@1" : "runware:100@1";
                        // Get Reference Image ID if applicable
                        const refImageId = (settings.visualStyle === 'reference_image' && settings.referenceCharacter)
                            ? CHARACTER_REFERENCE_MAP[settings.referenceCharacter]
                            : undefined;

                        imageUrl = await generateRunwareImage(fullPrompt, projectId, sceneIndex, settings.aspectRatio, modelId, refImageId);
                    } else {
                        // Default to Fal
                        imageUrl = await generateFalImage(fullPrompt, projectId, sceneIndex, settings.aspectRatio);
                    }
                } catch (e: any) {
                    console.error("Image Generation Failed:", e);
                    throw new Error(`Image Gen Failed: ${e.message}`);
                }
            } else {
                // Use stock video as the "image_url" (visual asset)
                imageUrl = stockVideoUrl!;
            }

            // 8.5. Check if we need a second image (Long Sentence Break)
            let imageUrl2: string | null = null;
            const wordCount = text.trim().split(/\s+/).length;
            if (settings.longSentenceBreak && wordCount > 20 && mediaType === 'image') {
                console.log(`Scene has ${wordCount} words - generating second image for variety`);
                try {
                    // Generate a different prompt for the second image with retry
                    const prompt2Response = await keyRotation.withRetry(
                        async (apiKey) => {
                            const openai = getOpenAIClient(apiKey);
                            return await openai.chat.completions.create({
                                model: 'gpt-4o-mini',
                                messages: [
                                    {
                                        role: 'system',
                                        content: 'You are a prompt generator for visual scenes. Generate a visual scene description that is DIFFERENT from the first one but still related to the same topic. Return ONLY a single sentence visual description, no JSON.'
                                    },
                                    {
                                        role: 'user',
                                        content: `Create a second, different visual description for: ${text}. Make it complementary but different from: ${simplePrompt}`
                                    }
                                ],
                                temperature: 0.9, // Higher temp for more variety
                            });
                        },
                        () => keyRotation.getNextOpenAIKey()
                    );

                    const simplePrompt2 = prompt2Response.choices[0].message.content?.trim() || simplePrompt;
                    const fullPrompt2 = `${simplePrompt2} ${styleDesc} ${subjectDesc} NO TEXT IN THE IMAGE. Negative: ${negativePrompt}`;

                    console.log('Generating second image with different prompt:', simplePrompt2);

                    // Generate second image using same model
                    if (settings.imageModel === 'imagen') {
                        try {
                            imageUrl2 = await generateImagenImage(fullPrompt2, projectId, sceneIndex + 0.5, settings.aspectRatio);
                        } catch (imagenError: any) {
                            console.warn('Imagen failed for second image, falling back to Gemini:', imagenError.message);
                            imageUrl2 = await generateGeminiImage(fullPrompt2, projectId, sceneIndex + 0.5, settings.aspectRatio);
                        }
                    } else if (settings.imageModel === 'gemini') {
                        imageUrl2 = await generateGeminiImage(fullPrompt2, projectId, sceneIndex + 0.5, settings.aspectRatio);
                    } else if (settings.imageModel === 'runware' || settings.visualStyle === 'reference_image') {
                        const modelId = settings.visualStyle === 'reference_image' ? "runware:400@1" : "runware:100@1";
                        const refImageId = (settings.visualStyle === 'reference_image' && settings.referenceCharacter)
                            ? CHARACTER_REFERENCE_MAP[settings.referenceCharacter]
                            : undefined;

                        imageUrl2 = await generateRunwareImage(fullPrompt2, projectId, sceneIndex + 0.5, settings.aspectRatio, modelId, refImageId);
                    } else {
                        imageUrl2 = await generateFalImage(fullPrompt2, projectId, sceneIndex + 0.5, settings.aspectRatio);
                    }

                    console.log('Second image generated successfully:', imageUrl2);
                } catch (e: any) {
                    console.error('Failed to generate second image:', e);
                    // Continue with single image if second generation fails
                }
            }

            // 9. Update Scene to Ready
            const { error: updateError } = await supabase
                .from('scenes')
                .update({
                    prompt: fullPrompt,
                    image_url: imageUrl,
                    image_url_2: imageUrl2, // Second image for long sentences
                    audio_url: audioUrl,
                    duration: audioDuration,
                    status: 'ready',
                    media_type: mediaType,
                    attribution: attribution
                })
                .eq('id', newScene.id);

            if (updateError) throw updateError;

            // 10. Deduct Credit
            console.log(`Deducting credit for ${userId}`);
            const { error: rpcError } = await supabase.rpc('decrement_credits', { user_id: userId, amount: 1 });
            if (rpcError) throw rpcError;

            return {
                success: true,
                scene: {
                    ...newScene,
                    status: 'ready',
                    image_url: imageUrl,
                    audio_url: audioUrl,
                    duration: audioDuration,
                    prompt: fullPrompt,
                    media_type: mediaType,
                    attribution
                }
            };

        } catch (genError: any) {
            console.error("Scene Generation Failed:", genError);
            // Update the pending scene to show error status
            if (newScene?.id) {
                await supabase.from('scenes').update({ status: 'error' }).eq('id', newScene.id);
            }
            throw genError;
        }
    } catch (e: any) {
        console.error("Top-level Scene Gen Error:", e);
        return { success: false, error: e.message };
    }
}
