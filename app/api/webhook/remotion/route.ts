import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

import { validateWebhookSignature } from '@remotion/lambda';

export async function POST(req: NextRequest) {
    const bodyText = await req.text(); // Get text first for signature
    const signature = req.headers.get('x-remotion-signature');
    const secret = process.env.REMOTION_WEBHOOK_SECRET || 'temp_secret';

    if (!signature) {
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
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = JSON.parse(bodyText);
    const supabase = await createClient();

    // Log the event (debug)
    console.log('[Remotion Webhook] Received event:', body.type);

    if (body.type === 'success') {
        const { renderId, outBucket, outKey, inputProps } = body.payload;
        // Construct the S3 URL (or CloudFront if configured)
        // Default S3 URL: https://[bucket].s3.[region].amazonaws.com/[key]
        const region = process.env.REMOTION_AWS_REGION || 'us-east-1';
        const videoUrl = `https://${outBucket}.s3.${region}.amazonaws.com/${outKey}`;

        // We need to find the projectId. Ideally it's passed in inputProps or customData.
        // Let's assume inputProps has projectId or we parse it from the request if possible.
        // IMPORTANT: In the trigger, pass projectId inside inputProps!
        const projectId = inputProps.projectId;

        if (projectId) {
            await supabase
                .from('projects')
                .update({
                    status: 'done',
                    video_url: videoUrl
                })
                .eq('id', projectId);
            console.log(`[Remotion Webhook] Project ${projectId} marked DONE.`);
        }
    } else if (body.type === 'error' || body.type === 'timeout') {
        const { inputProps, errorMessage } = body.payload;
        const projectId = inputProps?.projectId;

        if (projectId) {
            await supabase
                .from('projects')
                .update({ status: 'error' })
                .eq('id', projectId);
            console.error(`[Remotion Webhook] Project ${projectId} FAILED:`, errorMessage);
        }
    }

    return NextResponse.json({ received: true });
}
