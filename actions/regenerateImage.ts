'use server';

import { createClient } from '@/utils/supabase/server';
import { generateFalImage, generateRunwareImage, generateGeminiImage } from '@/lib/ai';

export async function regenerateImage(sceneId: string, text: string, visualStyle: string, imageModel: string, projectId: string, sceneIndex: number, aspectRatio: string = '16:9') {
    const supabase = await createClient();

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // 2. Verify scene ownership
    const { data: scene } = await supabase
        .from('scenes')
        .select('*, projects!inner(user_id)')
        .eq('id', sceneId)
        .single();

    if (!scene || scene.projects.user_id !== user.id) {
        return { success: false, error: 'Scene not found or unauthorized' };
    }

    try {
        console.log(`Regenerating image for scene ${sceneId}`);

        // 3. Build Full Styled Prompt (Same logic as generateScene.ts)
        const simplePrompt = text.trim();
        const styleMode = visualStyle;
        let styleDesc = "";
        let subjectDesc = "";
        let negativePrompt = "";

        if (styleMode === "normal") {
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

        // 4. Generate image with the same provider logic
        let imageUrl = "";
        if (imageModel === 'gemini') {
            imageUrl = await generateGeminiImage(fullPrompt, projectId, sceneIndex, aspectRatio);
        } else if (imageModel === 'runware') {
            imageUrl = await generateRunwareImage(fullPrompt, projectId, sceneIndex, aspectRatio);
        } else {
            imageUrl = await generateFalImage(fullPrompt, projectId, sceneIndex, aspectRatio);
        }

        // 5. Update scene with new image
        const { error: updateError } = await supabase
            .from('scenes')
            .update({
                image_url: imageUrl,
                prompt: fullPrompt
            })
            .eq('id', sceneId);

        if (updateError) throw updateError;

        return { success: true, imageUrl, prompt: fullPrompt };
    } catch (e: any) {
        console.error('Regenerate Image Failed:', e);
        return { success: false, error: e.message };
    }
}
