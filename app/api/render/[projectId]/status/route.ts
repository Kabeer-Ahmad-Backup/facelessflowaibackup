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
        let hasUpdates = false;

        const partsDetails = [];

        // We process sequentially to avoid AWS rate limits if many parts
        for (const part of parts) {
            let partProgress = 0;
            let partStatus = part.status;

            if (part.status === 'done') {
                partProgress = 1;
                totalProgress += 1;
            } else if (part.status === 'error') {
                partProgress = 0;
                // If error, count as 0
            } else if (part.renderId) {
                try {
                    const progress = await getRenderProgress({
                        renderId: part.renderId,
                        bucketName: part.bucketName,
                        functionName: process.env.REMOTION_AWS_FUNCTION_NAME!,
                        region: (process.env.REMOTION_AWS_REGION as any) || region,
                    });

                    partProgress = progress.overallProgress;
                    framesRendered += progress.framesRendered || 0;
                    lambdasInvoked += progress.lambdasInvoked || 0;
                    totalProgress += progress.overallProgress;

                    // Check if completion happened during polling
                    if (progress.overallProgress >= 1 || progress.outputFile) {
                        const videoUrl = `https://${part.bucketName}.s3.${region}.amazonaws.com/renders/${part.renderId}/out.mp4`;
                        part.status = 'done';
                        part.url = videoUrl;
                        partStatus = 'done';
                        hasUpdates = true;
                    } else if (progress.fatalErrorEncountered) {
                        part.status = 'error';
                        partStatus = 'error';
                        hasUpdates = true;
                    }

                } catch (e) {
                    console.error(`Error fetching progress for part ${part.part}:`, e);
                }
            }

            partsDetails.push({
                part: part.part,
                status: partStatus,
                progress: partProgress,
                url: part.url
            });
        }

        // If any parts updated their status, save to DB
        if (hasUpdates) {
            const newSettings = {
                ...project.settings as object,
                renderParts: parts
            };

            // Check if ALL parts are done to update global status
            const allDone = parts.every((p: any) => p.status === 'done');

            const updatePayload: any = {
                settings: newSettings
            };

            if (allDone) {
                updatePayload.status = 'done';
                // Maybe combine videos or just point to something? 
                // For now, if split, we might just leave video_url as empty or point to playlist?
                // But the prompt wants per-part downloads, so maybe we don't set global video_url.
                // Or we set status to 'done'.
            }

            await supabase.from('projects').update(updatePayload).eq('id', projectId);
        }

        const avgProgress = parts.length > 0 ? totalProgress / parts.length : 0;

        return NextResponse.json({
            progress: avgProgress,
            status: project.status,
            parts: partsDetails,
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
