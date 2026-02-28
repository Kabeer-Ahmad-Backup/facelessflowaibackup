'use server';

import { createClient } from "@/utils/supabase/server";
import { ProjectSettings } from "@/types";

export async function createTemplateProject(
    projectId: string,
    slices: { text: string; url: string; duration: number }[],
    settings: ProjectSettings
) {
    const supabase = await createClient();

    // 1. Get User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 2. Build full script context
    const fullScript = slices.map(s => s.text).join(' ');

    // 3. Update Project
    const { error: projectError } = await supabase
        .from('projects')
        .update({
            script: fullScript,
            status: 'draft',
            settings: settings,
        })
        .eq('id', projectId);

    if (projectError) throw projectError;

    const scenesToInsert = [];

    // 4. Construct Alternate Scenes
    for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];

        if (i % 2 === 0) {
            // Avatar Video Scene (Even index)
            scenesToInsert.push({
                project_id: projectId,
                order_index: i,
                text: slice.text,
                prompt: null,
                image_url: slice.url,
                audio_url: slice.url, // Original video audio
                duration: slice.duration,
                media_type: 'video',
                status: 'ready', // Immediately ready, skip visual mapping
            });
        } else {
            // AI Image Scene (Odd index)
            scenesToInsert.push({
                project_id: projectId,
                order_index: i,
                text: slice.text,
                prompt: null,
                image_url: null, // Will be generated
                audio_url: slice.url, // Reuses the slice to preserve the original voice
                duration: slice.duration,
                media_type: 'image',
                status: 'pending', // Will be picked up by the generator
            });
        }
    }

    // 5. Insert all scenes
    const { error: scenesError } = await supabase
        .from('scenes')
        .insert(scenesToInsert);

    if (scenesError) {
        console.error("Failed to insert template scenes", scenesError);
        throw new Error("Failed to create template scenes");
    }

    return { projectId };
}
