import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { renderMediaOnLambda } from '@remotion/lambda/client';
import { region } from '../../../../remotion/lambda/config';

export async function POST(
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

    // 2. Parse Body (Optional)
    let partNumber: number | undefined;
    try {
        const body = await request.json();
        partNumber = body.part;
    } catch (e) {
        // Body might be empty for legacy/full render
    }

    // 3. Verify Ownership & Get Project Data
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (projectError || !project || project.user_id !== user.id) {
        return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // 4. Get Scenes
    const { data: scenes, error: scenesError } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'ready')
        .order('order_index');

    if (scenesError || !scenes || scenes.length === 0) {
        return NextResponse.json({ error: 'No ready scenes found' }, { status: 400 });
    }

    // 5. Update Status to 'rendering'
    // Note: If partial, we still set status to 'rendering'. 
    await supabase.from('projects').update({ status: 'rendering' }).eq('id', projectId);

    try {
        const functionName = process.env.REMOTION_AWS_FUNCTION_NAME;
        const serveUrl = process.env.REMOTION_SERVE_URL;

        if (!functionName || !serveUrl) {
            throw new Error('AWS Lambda configuration missing');
        }

        const MAX_SCENES = 200; // Resetting to 200 for stability (300 scenes = ~63k frames, causing timeouts)
        const webhookSecret = process.env.REMOTION_WEBHOOK_SECRET || 'temp_secret';

        // --- LOGIC BRANCHING ---

        let scenesToRender = scenes;
        let isPart = false;
        let currentPartIndex = 0; // 0-based

        if (partNumber !== undefined) {
            // MANUAL PART RENDER
            const startIndex = (partNumber - 1) * MAX_SCENES;
            const endIndex = startIndex + MAX_SCENES;
            scenesToRender = scenes.slice(startIndex, endIndex);
            isPart = true;
            currentPartIndex = partNumber - 1;

            console.log(`[Render API] Triggering Manual Part ${partNumber}: Scenes ${startIndex} to ${endIndex} (${scenesToRender.length} scenes)`);
        } else {
            console.log(`[Render API] Triggering Full Render (${scenes.length} scenes)`);
        }

        if (scenesToRender.length === 0) {
            throw new Error("No scenes to render for this part.");
        }

        // --- OPTIMIZATION & TRIGGER ---
        const TARGET_CONCURRENCY = 150;
        const totalFrames = scenesToRender.reduce((acc: number, scene: any) => {
            let d = scene.duration || 5;
            if (d > 300) d = d / 1000;
            return acc + Math.ceil(d * 30);
        }, 0) || 300;

        const minFramesForLimit = Math.ceil(totalFrames / 200);
        const optimalFrames = Math.ceil(totalFrames / TARGET_CONCURRENCY);
        const dynamicFramesPerLambda = Math.max(60, minFramesForLimit, optimalFrames);

        console.log(`[Render API] Optimization: ${totalFrames} frames / ${TARGET_CONCURRENCY} concurrency = ${dynamicFramesPerLambda} frames/lambda`);

        const { renderId, bucketName } = await renderMediaOnLambda({
            region: (process.env.REMOTION_AWS_REGION as any) || region,
            functionName,
            serveUrl,
            composition: 'MirzaMain',
            inputProps: {
                scenes: scenesToRender,
                settings: project.settings,
                projectId,
                isPart,
                partIndex: currentPartIndex,
            },
            codec: 'h264',
            framesPerLambda: dynamicFramesPerLambda,
            timeoutInSeconds: 900,
            chromiumOptions: {
                // @ts-ignore - Valid in runtime, type definition might be outdated
                delayRenderTimeoutInMilliSeconds: 60000,
            },
            downloadBehavior: { type: 'download', fileName: null },
            webhook: {
                url: 'https://facelessflowai.vercel.app/api/webhook/remotion',
                secret: webhookSecret,
            },
        });

        console.log(`[Render API] Started Render: ${renderId}`);

        // --- DATABASE UPDATE ---
        if (isPart && partNumber) {
            // Update specific part in renderParts array
            // We need to fetch latest project settings again to avoid overwriting race conditions?
            // For now, use the one we fetched (low concurrency assumed).
            const currentParts = project.settings.renderParts || [];

            // Remove existing entry for this part if exists
            const otherParts = currentParts.filter((p: any) => p.part !== partNumber);

            const newPartEntry = {
                id: `part-${partNumber}`,
                bucketName,
                renderId,
                status: 'rendering',
                part: partNumber,
                frameCount: totalFrames
            };

            const updatedParts = [...otherParts, newPartEntry].sort((a: any, b: any) => a.part - b.part);

            await supabase.from('projects').update({
                status: 'rendering',
                settings: {
                    ...project.settings,
                    renderParts: updatedParts
                }
            }).eq('id', projectId);

            return NextResponse.json({
                success: true,
                message: `Started Part ${partNumber}`,
                renderId
            });

        } else {
            // Legacy Single Render Update
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
                message: 'Rendering started',
                renderId
            });
        }

    } catch (error: any) {
        console.error('[Render API] Error:', error);

        await supabase.from('projects').update({ status: 'error' }).eq('id', projectId);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
