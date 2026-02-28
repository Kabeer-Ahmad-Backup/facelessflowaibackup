'use server';

import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getSignedUploadUrl(
    filename: string
) {
    if (!filename) throw new Error("No filename provided");

    // Instead of passing the video blob through the Next.js API limit,
    // we use the Admin Service Key to securely mint a temporary Signed Upload URL
    // allowing the client to upload its chunks directly to the cloud.
    const { data, error } = await supabaseAdmin.storage
        .from('projects')
        .createSignedUploadUrl(filename);

    if (error || !data) {
        console.error("Admin Signed URL Error:", error);
        throw new Error(`Failed to create signed upload url: ${error?.message}`);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
        .from('projects')
        .getPublicUrl(filename);

    return { token: data.token, url: publicUrlData.publicUrl };
}
