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

    // 2. Check for Multi-Part Render
    if ((project.settings as any)?.renderParts) {
        const parts = (project.settings as any).renderParts;
        let totalProgress = 0;
        let framesRendered = 0;
        let lambdasInvoked = 0;

        // We process sequentially to avoid AWS rate limits if many parts
        for (const part of parts) {
            if (part.status === 'done') {
                totalProgress += 1;
            } else if (part.status === 'error') {
                // If error, maybe count as 0 or handling differently? 
                // Let's count as 0 to keep average low, or 1 if we consider it "finished" processing?
                // Visual progress bar should probably reflect work done.
                totalProgress += 0;
            } else {
                try {
                    const progress = await getRenderProgress({
                        renderId: part.renderId,
                        bucketName: part.bucketName,
                        functionName: process.env.REMOTION_AWS_FUNCTION_NAME!,
                        region: (process.env.REMOTION_AWS_REGION as any) || region,
                    });
                    totalProgress += progress.overallProgress;
                    framesRendered += progress.framesRendered || 0;
                    lambdasInvoked += progress.lambdasInvoked || 0;
                } catch (e) {
                    console.error(`Error fetching progress for part ${part.part}:`, e);
                }
            }
        }

        const avgProgress = totalProgress / parts.length;

        return NextResponse.json({
            progress: avgProgress,
            status: project.status,
            details: {
                framesRendered,
                lambdasInvoked
            }
        });
    }

    // 3. Single Render Logic (Legacy)
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

        if (progress.overallProgress >= 1 || progress.outputFile) {
            // RENDERING COMPLETE (Fallback if Webhook fails)
            // Construct video URL (S3)
            const videoUrl = `https://${bucketName}.s3.${region}.amazonaws.com/renders/${renderId}/out.mp4`;

            // Only update if not already done (avoid race with webhook)
            if (project.status !== 'done') {
                await supabase.from('projects').update({
                    status: 'done',
                    video_url: videoUrl
                }).eq('id', projectId);
            }

            return NextResponse.json({
                progress: 1,
                status: 'done',
                details: {
                    framesRendered: progress.framesRendered,
                    costs: progress.costs,
                    lambdasInvoked: progress.lambdasInvoked
                },
                videoUrl
            });
        }

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

        // If the job is lost/failed, we should stop the polling loop
        // We update the project status to error
        await supabase.from('projects').update({ status: 'error' }).eq('id', projectId);

        return NextResponse.json({ progress: 0, status: 'error', error: e.message });
    }
}
