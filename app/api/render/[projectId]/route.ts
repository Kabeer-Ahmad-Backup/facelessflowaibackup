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

        // REUSE BUCKET LOGIC:
        // If we have existing parts that successfully rendered (or even started), they used a bucket.
        // Use that bucket if available to avoid "Finding bucket..." DNS flakes or creation overhead.
        let targetBucketName = process.env.REMOTION_AWS_BUCKET;

        if (!targetBucketName && project.settings?.renderParts) {
            const existingPartWithBucket = project.settings.renderParts.find((p: any) => p.bucketName);
            if (existingPartWithBucket) {
                targetBucketName = existingPartWithBucket.bucketName;
                console.log(`[Render API] Reusing existing bucket: ${targetBucketName}`);
            }
        }

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
            // @ts-ignore - bucketName is valid but types might be strict
            bucketName: targetBucketName,
            inputProps: {
                scenes: scenesToRender,
                settings: project.settings,
                projectId,
                isPart,
                partIndex: currentPartIndex,
            },
            codec: 'h264',
            framesPerLambda: dynamicFramesPerLambda,
            timeoutInMilliseconds: 900000,
            // @ts-ignore - explicitly allowed by Remotion Lambda but types might differ
            delayRenderTimeoutInMilliSeconds: 60000,
            chromiumOptions: {
                // ... other options if needed, or empty
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
            // 1. Ensure array exists and is fully initialized for robustness
            let currentParts = project.settings.renderParts || [];
            const totalParts = Math.ceil(scenes.length / MAX_SCENES);

            // INITIALIZATION: If parts array is empty or length mismatch, initialize valid structure
            if (currentParts.length === 0 || currentParts.length !== totalParts) {
                console.log(`[Render API] Initializing ${totalParts} parts for split render.`);
                currentParts = Array.from({ length: totalParts }).map((_, idx) => {
                    // Try to preserve existing if we are resizing? Or just overwrite?
                    // Safe approach: check if existing part data is compatible
                    const pNum = idx + 1;
                    const existing = (project.settings.renderParts || []).find((p: any) => p.part === pNum);
                    return existing || {
                        id: `part-${pNum}`,
                        part: pNum,
                        status: 'idle',
                        bucketName: undefined,
                        renderId: undefined,
                        url: undefined
                    };
                });
            }

            // 2. Setup new entry for the ACTIVE part
            const newPartEntry = {
                id: `part-${partNumber}`,
                bucketName,
                renderId,
                status: 'rendering',
                part: partNumber,
                frameCount: totalFrames
            };

            // 3. Update the specific index
            const partIndexInArray = partNumber - 1; // 1-based to 0-based
            if (currentParts[partIndexInArray]) {
                currentParts[partIndexInArray] = {
                    ...currentParts[partIndexInArray],
                    ...newPartEntry
                };
            } else {
                // Fallback (shouldn't happen with init above)
                currentParts.push(newPartEntry);
            }

            // Sort to be safe
            const updatedParts = currentParts.sort((a: any, b: any) => a.part - b.part);

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
