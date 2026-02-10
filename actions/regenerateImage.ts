'use server';

import { SceneApi, ProjectSettings } from '@/types';
import { createClient } from '@/utils/supabase/server';
import { generateFalImage, generateRunwareImage, generateGeminiImage, generateReplicateImage } from '@/lib/ai';
import { generateImagenImage } from '@/lib/imagen';
import OpenAI from 'openai';

import { CHARACTER_REFERENCE_MAP } from '@/lib/constants';

import keyRotation from '@/lib/keyRotation';

function getOpenAIClient(apiKey: string) {
    return new OpenAI({ apiKey });
}

export async function regenerateImage(sceneId: string, text: string, visualStyle: string, imageModel: string, projectId: string, sceneIndex: number, aspectRatio: string = '16:9') {
    const supabase = await createClient();

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // 2. Verify scene ownership & Fetch Settings
    const { data: scene } = await supabase
        .from('scenes')
        .select('*, projects!inner(user_id, settings)')
        .eq('id', sceneId)
        .single();

    if (!scene || scene.projects.user_id !== user.id) {
        return { success: false, error: 'Scene not found or unauthorized' };
    }

    const settings = scene.projects.settings as any; // Cast to access fields
    // Use passed visualStyle/imageModel if available, or fallback to settings
    // But for referenceCharacter we MUST look at settings since it's not passed
    const activeStyle = visualStyle || settings.visualStyle;
    const activeModel = imageModel || settings.imageModel;

    try {
        console.log(`Regenerating image for scene ${sceneId} with style: ${activeStyle}`);

        // 3. Generate fresh prompt using OpenAI with retry
        console.log('Generating fresh prompt with OpenAI...');
        const promptResponse = await keyRotation.withRetry(
            async (apiKey) => {
                const openai = getOpenAIClient(apiKey);

                // Use James-specific instructions for james_finetuned style
                const systemPrompt = activeStyle === 'james_finetuned'
                    ? 'You are a visual prompt writer creating scenes featuring James (a male character) as the central subject. Generate a detailed visual scene description showing James performing, explaining, or demonstrating the action described. James must be the main subject. Return ONLY a single sentence visual description.'
                    : 'You are a visual prompt writer. Generate a detailed, visual, descriptive scene prompt based on the given text. Return ONLY a single sentence visual description, no JSON, no explanations.';

                return await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: `Create a detailed visual scene description for: ${text}`
                        }
                    ],
                    temperature: 0.8,
                });
            },
            () => keyRotation.getNextOpenAIKey()
        );

        let simplePrompt = promptResponse.choices[0].message.content?.trim() || text;
        console.log('Generated prompt:', simplePrompt);

        // 4. Build Full Styled Prompt (Same logic as generateScene.ts)
        const styleMode = activeStyle;
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
        } else if (styleMode === "reference_image") {
            // User-provided strict prompt template
            styleDesc = `Role: You are an expert storyboard artist creating high-fidelity assets for a modern animated video series. Do not add Text to images.

1. Character Consistency Protocol:
Strict Adherence: Use the provided image as an consistent fixed visual charachter. Maintain the exact stick-figure proportions, line weight, and head-to-body ratio.
Expression: Map the requested emotion onto the minimal facial features without adding realistic details that contradict the style. Use exaggerated posture and gestural body language to convey intent.

2. Environment & Composition:
Setting: Generate a fully immersive, "world-building" background. Never use white, solid, or gradient voids. The environment must be rich with narrative details (props, furniture, nature) relevant to the scene.
Framing: Use a cinematic 16:9 composition. Ensure the subject is clearly separated from the background using contrast and soft lighting.

3. Art Direction:
Style: Modern 2D Vector Illustration.
No text in image.
Visuals: Flat colors, clean smooth outlines, zero pixelation, and soft, cel-shaded lighting. Use visual metaphors if the scene calls for it.
Output Quality: High-contrast, sharp lines, suitable for 4K video playback.`;

            subjectDesc = ""; // Handled by reference image and prompt context
            negativePrompt = "text, watermark, extra limbs, distorted face, 3d, realistic, photo, blur, noise, grainy, white background, simple background";
        } else if (styleMode === "thick_stick_color") {
            styleDesc = "Style: simple human stick figure pictogram, head and limbs only, very simplified torso shape, arms and legs as thick solid rounded rods, rounded limb ends, solid filled shapes not outlines, minimal facial features, flat vector illustration, simple color fills, colored clothing blocks (shirt and pants as simple shapes), limited color palette, friendly abstract style, white background, no shading, no texture";
            subjectDesc = "Subject: Thick stick figure pictograms in simple colors";
            negativePrompt = "realistic anatomy, detailed body, thin limbs, single line drawing, sketch, ink, pencil, line art, outline only, comic style, cartoon character, childrens illustration, detailed clothing folds, textures text";
        } else if (styleMode === "thick_stick_bw") {
            styleDesc = "Style: simple human stick figure pictogram, head and limbs only, no detailed torso, arms and legs as thick solid rods, rounded limb ends, solid filled shapes not lines, minimal facial features or no face, instructional diagram style, ISO safety icon style, flat vector symbol, very minimal detail, no clothing, no anatomy, white background";
            subjectDesc = "Subject: Black and white thick stick figure symbols";
            negativePrompt = "cartoon character, childrens illustration, human anatomy, body proportions, clothing, shirt, pants, realistic, sketch, line drawing, outline only, thin lines, comic style text";
        } else if (styleMode === "james_finetuned") {
            // James Finetuned uses Replicate with JAMESTOK trigger
            styleDesc = "A clean flat cartoon character of NEWJAMESTOK, white hair, white short beard, adult , he is 30 years old: ";
            subjectDesc = "";
            negativePrompt = "";
        } else { // zen
            styleDesc = "Style: Cinematic, photorealistic, 8k, serene lighting.";
            subjectDesc = "Subject: Zen Buddhist monk in orange robes/clothes and in meditative or teaching poses, minimalist Asian temple backgrounds.";
            negativePrompt = "text, logos, writing, modern, cluttered";
        }

        // For James Finetuned, append the JAMESTOK trigger
        const fullPrompt = styleMode === "james_finetuned"
            ? `${styleDesc} ${simplePrompt}`
            : `${simplePrompt} ${styleDesc} ${subjectDesc} NO TEXT IN THE IMAGE. Negative: ${negativePrompt}`;

        // 4. Generate image with the same provider logic
        let imageUrl = "";
        if (activeModel === 'imagen') {
            try {
                imageUrl = await generateImagenImage(fullPrompt, projectId, sceneIndex, aspectRatio);
            } catch (imagenError: any) {
                console.warn('Imagen failed, falling back to Gemini:', imagenError.message);
                imageUrl = await generateGeminiImage(fullPrompt, projectId, sceneIndex, aspectRatio);
            }
        } else if (activeModel === 'gemini') {
            imageUrl = await generateGeminiImage(fullPrompt, projectId, sceneIndex, aspectRatio);
        } else if (activeModel === 'runware' || activeStyle === 'reference_image') { // Force Runware for reference_image
            // Enforce 400@1 for reference_image, otherwise 100@1
            const modelId = activeStyle === 'reference_image' ? "runware:400@1" : "runware:100@1";
            // Get Reference Image ID if applicable
            const refImageId = (activeStyle === 'reference_image' && settings.referenceCharacter)
                ? CHARACTER_REFERENCE_MAP[settings.referenceCharacter]
                : undefined;

            imageUrl = await generateRunwareImage(fullPrompt, projectId, sceneIndex, aspectRatio, modelId, refImageId);
        } else if (activeModel === 'replicate') {
            // James Finetuned model
            imageUrl = await generateReplicateImage(fullPrompt, aspectRatio, projectId, sceneIndex);
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
