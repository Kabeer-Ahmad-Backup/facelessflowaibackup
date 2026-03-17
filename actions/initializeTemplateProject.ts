'use server';

import { createClient } from "@/utils/supabase/server";

import { ProjectSettings } from "@/types";

export async function initializeTemplateProject(settings: ProjectSettings) {
    const supabase = await createClient();

    // 1. Get User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 2. Create Project Skeleton
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
            user_id: user.id,
            script: 'Template Project (Pending Analysis)',
            status: 'draft',
            settings: { ...settings, templatePending: true },
        })
        .select()
        .single();

    if (projectError) throw projectError;

    return { projectId: project.id };
}
