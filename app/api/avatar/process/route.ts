import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { videoUrl, projectId } = await request.json();

        if (!videoUrl || !projectId) {
            return NextResponse.json({ error: 'Missing videoUrl or projectId' }, { status: 400 });
        }

        const workerUrl = process.env.AVATAR_WORKER_URL;
        if (!workerUrl) {
            return NextResponse.json({ error: 'AVATAR_WORKER_URL is not configured on the server.' }, { status: 500 });
        }

        console.log(`[Avatar Process] Triggering async job on worker: ${workerUrl}`);

        const response = await fetch(`${workerUrl.replace(/\/$/, '')}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoUrl,
                projectId,
                supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
                supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                openaiKey: process.env.OPENAI_API_KEY
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Worker Error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        // Result will now be { "job_id": "..." }
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('[Avatar Process API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
