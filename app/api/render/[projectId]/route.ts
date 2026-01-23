import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { renderMediaOnLambda } from '@remotion/lambda/client';
import { region } from '../../../../remotion/lambda/config';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const supabase = await createClient();

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Verify Ownership & Get Project Data
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (projectError || !project || project.user_id !== user.id) {
        return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // 3. Get Scenes
    const { data: scenes, error: scenesError } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'ready')
        .order('order_index');

    if (scenesError || !scenes || scenes.length === 0) {
        return NextResponse.json({ error: 'No ready scenes found' }, { status: 400 });
    }

    // 4. Update Status to 'rendering'
    await supabase.from('projects').update({ status: 'rendering' }).eq('id', projectId);

    try {
        console.log(`[Render API] Triggering AWS Lambda for project ${projectId}`);

        const functionName = process.env.REMOTION_AWS_FUNCTION_NAME;
        const serveUrl = process.env.REMOTION_SERVE_URL;

        if (!functionName || !serveUrl) {
            throw new Error('AWS Lambda configuration missing (REMOTION_AWS_FUNCTION_NAME or REMOTION_SERVE_URL)');
        }


        // Calculate concurrency to maximize speed while staying under AWS limits
        // Target 50 concurrent lambdas (safe for new accounts, much faster than 1)
        const TARGET_CONCURRENCY = 100;
        const totalFrames = scenes.reduce((acc: number, scene: any) => acc + Math.ceil((scene.duration || 5) * 30), 0) || 300;

        // Ensure framesPerLambda is at least 60 (Remotion recommendation)
        // For 100k frames: 100,000 / 50 = 2000 frames/lambda
        // For 300 frames: 300 / 50 = 6 frames -> clamped to 60 -> 5 lambdas
        const dynamicFramesPerLambda = Math.max(60, Math.ceil(totalFrames / TARGET_CONCURRENCY));

        console.log(`[Render API] Optimization: ${totalFrames} frames / ${TARGET_CONCURRENCY} concurrency = ${dynamicFramesPerLambda} frames/lambda`);

        const { renderId, bucketName } = await renderMediaOnLambda({
            region: (process.env.REMOTION_AWS_REGION as any) || region,
            functionName,
            serveUrl,
            composition: 'MirzaMain',
            inputProps: {
                scenes,
                settings: project.settings,
                projectId // Critical for Webhook correlation
            },
            codec: 'h264',
            framesPerLambda: dynamicFramesPerLambda,
            downloadBehavior: {
                type: 'download',
                fileName: null,
            },
            webhook: {
                url: 'https://facelessflowai.vercel.app/api/webhook/remotion',
                secret: process.env.REMOTION_WEBHOOK_SECRET || 'temp_secret',
            },
        });

        console.log(`[Render API] Started Render: ${renderId} on bucket ${bucketName}`);

        // Save renderId to project settings so we can poll progress
        // We use settings.renderId as a temporary storage place
        await supabase.from('projects').update({
            status: 'rendering',
            settings: {
                ...project.settings,
                renderId,
                bucketName
            }
        }).eq('id', projectId);

        return NextResponse.json({
            success: true,
            message: 'Rendering started on AWS Lambda',
            renderId
        });

    } catch (error: any) {
        console.error('[Render API] Error:', error);

        await supabase.from('projects').update({ status: 'error' }).eq('id', projectId);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
