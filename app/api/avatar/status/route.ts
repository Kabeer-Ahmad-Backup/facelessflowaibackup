import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    try {
        const workerUrl = process.env.AVATAR_WORKER_URL;
        if (!workerUrl) {
            return NextResponse.json({ error: 'AVATAR_WORKER_URL is not configured.' }, { status: 500 });
        }

        const response = await fetch(`${workerUrl.replace(/\/$/, '')}/status/${jobId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Worker Status Error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('[Avatar Status API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
