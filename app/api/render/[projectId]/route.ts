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
        // Target 50-100 concurrent lambdas (safe for new accounts)
        const TARGET_CONCURRENCY = 100;
        const totalFrames = scenes.reduce((acc: number, scene: any) => {
            let d = scene.duration || 5;
            if (d > 300) d = d / 1000;
            return acc + Math.ceil(d * 30);
        }, 0) || 300;

        // SPLIT RENDERING LOGIC
        const MAX_SCENES = 300; // User configured limit
        const shouldSplit = scenes.length > MAX_SCENES;

        const webhookSecret = process.env.REMOTION_WEBHOOK_SECRET || 'temp_secret';

        if (shouldSplit) {
            console.log(`[Render API] Project has ${scenes.length} scenes. Splitting into parts (Max ${MAX_SCENES}).`);

            // Chunk scenes
            const chunks = [];
            for (let i = 0; i < scenes.length; i += MAX_SCENES) {
                chunks.push(scenes.slice(i, i + MAX_SCENES));
            }

            console.log(`[Render API] Created ${chunks.length} chunks.`);

            // Render each chunk in parallel
            const renderPromises = chunks.map(async (chunkScenes, index) => {
                const partNum = index + 1;
                console.log(`[Render API] Triggering Part ${partNum}/${chunks.length} (${chunkScenes.length} scenes)`);

                // Calculate frames for this chunk for optimization
                const chunkTotalFrames = chunkScenes.reduce((acc: number, scene: any) => {
                    let d = scene.duration || 5;
                    if (d > 300) d = d / 1000;
                    return acc + Math.ceil(d * 30);
                }, 0);

                const minFrames = Math.ceil(chunkTotalFrames / 200);
                const optFrames = Math.ceil(chunkTotalFrames / TARGET_CONCURRENCY);
                const framesPerLambda = Math.max(60, minFrames, optFrames);

                return renderMediaOnLambda({
                    region: (process.env.REMOTION_AWS_REGION as any) || region,
                    functionName,
                    serveUrl,
                    composition: 'MirzaMain',
                    inputProps: {
                        scenes: chunkScenes, // Only this chunk
                        settings: project.settings,
                        projectId,
                        isPart: true,
                        partIndex: index // 0-based
                    },
                    codec: 'h264',
                    framesPerLambda: framesPerLambda,
                    downloadBehavior: { type: 'download', fileName: null },
                    webhook: {
                        url: 'https://facelessflowai.vercel.app/api/webhook/remotion',
                        secret: webhookSecret,
                    },
                }).then(result => ({ ...result, part: partNum, frameCount: chunkTotalFrames }));
            });

            const results = await Promise.all(renderPromises);

            // Construct renderParts array
            const renderParts = results.map(r => ({
                id: `part-${r.part}`,
                bucketName: r.bucketName,
                renderId: r.renderId,
                status: 'rendering' as const,
                part: r.part,
                frameCount: r.frameCount
            }));

            // Save to DB
            await supabase.from('projects').update({
                status: 'rendering',
                settings: {
                    ...project.settings,
                    renderParts
                }
            }).eq('id', projectId);

            return NextResponse.json({
                success: true,
                message: `Started ${chunks.length} render parts on AWS Lambda`,
                renderParts
            });

        } else {
            // SINGLE RENDER LOGIC (Legacy / Small Projects)

            // REMOTION LIMIT: Max 200 lambda functions per render.
            // We MUST ensure totalFrames / framesPerLambda <= 200
            const minFramesForLimit = Math.ceil(totalFrames / 200);

            // Optimal frames based on our target concurrency
            const optimalFrames = Math.ceil(totalFrames / TARGET_CONCURRENCY);

            // Ensure framesPerLambda is at least 60 (Remotion recommendation)
            // And effectively max(minFramesForLimit, optimalFrames) to respect the 200 limit
            const dynamicFramesPerLambda = Math.max(60, minFramesForLimit, optimalFrames);

            console.log(`[Render API] Optimization: ${totalFrames} frames / ${TARGET_CONCURRENCY} concurrency = ${dynamicFramesPerLambda} frames/lambda`);
            console.log(`[Render API] Webhook Secret used: ${webhookSecret.substring(0, 3)}...`);

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
                    secret: webhookSecret,
                },
            });

            console.log(`[Render API] Started Render: ${renderId} on bucket ${bucketName}`);

            // Save renderId to project settings
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
        }

    } catch (error: any) {
        console.error('[Render API] Error:', error);

        await supabase.from('projects').update({ status: 'error' }).eq('id', projectId);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
