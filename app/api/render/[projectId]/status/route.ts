import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getRenderProgress } from '@remotion/lambda/client';
import { region } from '../../../../../remotion/lambda/config';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const supabase = await createClient();

    // 1. Get Project Data
    const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (error || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status === 'done') {
        return NextResponse.json({ progress: 1, status: 'done', done: true });
    }

    if (project.status === 'error') {
        return NextResponse.json({ progress: 0, status: 'error', error: 'Rendering failed' });
    }

    // 2. Get renderId from settings
    const renderId = (project.settings as any)?.renderId;
    const bucketName = (project.settings as any)?.bucketName || process.env.REMOTION_AWS_BUCKET;

    if (!renderId) {
        // If no renderId, we can't poll AWS. Return basic status.
        return NextResponse.json({ progress: 0, status: project.status });
    }

    try {
        const progress = await getRenderProgress({
            renderId,
            bucketName,
            functionName: process.env.REMOTION_AWS_FUNCTION_NAME!,
            region: (process.env.REMOTION_AWS_REGION as any) || region,
        });

        return NextResponse.json({
            progress: progress.overallProgress,
            status: project.status,
            details: {
                framesRendered: progress.framesRendered,
                costs: progress.costs,
                fatalError: progress.fatalErrorEncountered,
                lambdasInvoked: progress.lambdasInvoked
            }
        });
    } catch (e: any) {
        console.error("Error fetching progress:", e);
        return NextResponse.json({ progress: 0, status: project.status, error: e.message });
    }
}
