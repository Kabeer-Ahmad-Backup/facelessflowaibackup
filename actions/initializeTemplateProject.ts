'use server';

import { createClient } from "@/utils/supabase/server";

export async function initializeTemplateProject() {
    const supabase = await createClient();

    // 1. Get User
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 2. Create Project Skeleton
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
            user_id: user.id,
            script: '', // Will populate later
            status: 'draft',
            settings: {}, // Will populate later
        })
        .select()
        .single();

    if (projectError) throw projectError;

    return { projectId: project.id };
}
