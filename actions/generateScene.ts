'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { SceneApi, ProjectSettings } from '@/types';
import { generateMinimaxAudio, generateFalImage, generateRunwareImage, generateGeminiImage } from '@/lib/ai';
import { VOICE_ID_MAP } from '@/lib/constants';

// Admin client for bypass if needed
const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

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

        // 3. Initiate Scene in DB (Pending)
        const { data: newScene, error: initError } = await supabase
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

        try {

            // 4. Generate Simple Scene Description (OpenAI)
            const baseInstructions = `You are a creative visual director. For each sentence below, keeping context of the previous sentences in mind, create ONE simple image prompt that directly represents the sentence visually. 
            
RULES:
- Use clear, concrete objects, people, and actions
- Do NOT explain, do NOT add extra ideas beyond the sentence
- Keep prompts simple and focused
- Do NOT include style instructions or negative prompts
- Just describe WHAT to show, not HOW to show it

Output format: Return ONLY a valid JSON array of strings, containing exactly one string for the one sentence provided.`;

            const promptResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                    role: "system",
                    content: baseInstructions
                }, {
                    role: "user",
                    content: `Sentence: "${text}"`
                }]
            });

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
                styleDesc = "Style: Cinematic, photorealistic, 8k, everyday life, humanistic, natural lighting.";
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
            } else { // zen
                styleDesc = "Style: Cinematic, photorealistic, 8k, serene lighting.";
                subjectDesc = "Subject: Zen Buddhist monk in orange robes/clothes and in meditative or teaching poses, minimalist Asian temple backgrounds.";
                negativePrompt = "text, logos, writing, modern, cluttered";
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
                const audioResult = await generateMinimaxAudio(text, targetVoiceId, projectId, sceneIndex);
                audioUrl = audioResult.url;
                audioDuration = audioResult.duration;
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
                    if (settings.imageModel === 'gemini') {
                        imageUrl = await generateGeminiImage(fullPrompt, projectId, sceneIndex, settings.aspectRatio);
                    } else if (settings.imageModel === 'runware') {
                        imageUrl = await generateRunwareImage(fullPrompt, projectId, sceneIndex, settings.aspectRatio);
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

            // 9. Update Scene to Ready
            const { error: updateError } = await supabase
                .from('scenes')
                .update({
                    prompt: fullPrompt,
                    image_url: imageUrl,
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
