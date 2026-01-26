import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

import { validateWebhookSignature } from '@remotion/lambda';

export async function POST(req: NextRequest) {
    const bodyText = await req.text(); // Get text first for signature
    const signature = req.headers.get('x-remotion-signature');
    const secret = process.env.REMOTION_WEBHOOK_SECRET || 'temp_secret';

    if (!signature) {
        console.error('[Webhook] Missing signature header');
        return NextResponse.json({ message: 'Missing signature' }, { status: 401 });
    }

    try {
        validateWebhookSignature({
            secret,
            body: bodyText,
            signatureHeader: signature,
        });
    } catch (e) {
        console.error('[Webhook] Invalid signature', e);
        console.log(`[Webhook Debug] Secret configured: ${secret ? 'Yes' : 'No'} (starts with ${secret?.substring(0, 3)}...)`);
        console.log(`[Webhook Debug] Received Signature: ${signature}`);
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = JSON.parse(bodyText);
    const supabase = await createClient();

    // Log the event (debug)
    console.log('[Remotion Webhook] Received event:', body.type);

    if (body.type === 'success') {
        const { renderId, outBucket, outKey, inputProps } = body.payload;
        const region = process.env.REMOTION_AWS_REGION || 'us-east-1';
        const videoUrl = `https://${outBucket}.s3.${region}.amazonaws.com/${outKey}`;
        const projectId = inputProps?.projectId;

        if (projectId) {
            // Fetch project to check for multi-part
            const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();

            if (project && project.settings && project.settings.renderParts) {
                // MULTI-PART LOGIC
                const parts = project.settings.renderParts;
                const partIndex = parts.findIndex((p: any) => p.renderId === renderId);

                if (partIndex >= 0) {
                    parts[partIndex].status = 'done';
                    parts[partIndex].url = videoUrl;

                    // Check if all done
                    const allDone = parts.every((p: any) => p.status === 'done');

                    const updatePayload: any = {
                        settings: { ...project.settings, renderParts: parts }
                    };

                    if (allDone) {
                        updatePayload.status = 'done';
                        // Maybe set main video_url to the first part? Or empty?
                        // Frontend will handle checking parts.
                    }

                    await supabase.from('projects').update(updatePayload).eq('id', projectId);
                    console.log(`[Remotion Webhook] Partial Render ${renderId} (Part ${parts[partIndex].part}) DONE.`);
                }
            } else {
                // SINGLE PART LOGIC
                await supabase
                    .from('projects')
                    .update({
                        status: 'done',
                        video_url: videoUrl
                    })
                    .eq('id', projectId);
                console.log(`[Remotion Webhook] Project ${projectId} marked DONE.`);
            }
        }
    } else if (body.type === 'error' || body.type === 'timeout') {
        const { inputProps, errorMessage, renderId } = body.payload;
        const projectId = inputProps?.projectId;

        if (projectId) {
            const { data: project } = await supabase.from('projects').select('*').eq('id', projectId).single();

            if (project && project.settings && project.settings.renderParts) {
                // MULTI-PART ERROR
                const parts = project.settings.renderParts;
                const partIndex = parts.findIndex((p: any) => p.renderId === renderId);
                if (partIndex >= 0) {
                    parts[partIndex].status = 'error';
                    await supabase.from('projects').update({
                        status: 'error',
                        settings: { ...project.settings, renderParts: parts }
                    }).eq('id', projectId);
                }
                console.error(`[Remotion Webhook] Partial Render ${renderId} FAILED:`, errorMessage);
            } else {
                // SINGLE PART ERROR
                await supabase
                    .from('projects')
                    .update({ status: 'error' })
                    .eq('id', projectId);
                console.error(`[Remotion Webhook] Project ${projectId} FAILED:`, errorMessage);
            }
        }
    }

    return NextResponse.json({ received: true });
}
