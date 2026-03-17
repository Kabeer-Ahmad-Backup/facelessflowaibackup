import { useState, useCallback } from 'react';
import { createTemplateProject } from '@/actions/createTemplateProject';
import { ProjectSettings } from '@/types';

export function useAvatarWorker() {
    const [workerStatus, setWorkerStatus] = useState<string>('');
    const [workerProgress, setWorkerProgress] = useState<number>(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const processVideo = useCallback(async (
        projectId: string,
        videoUrl: string,
        settings: ProjectSettings
    ) => {
        setIsProcessing(true);
        setError(null);
        setWorkerStatus('Connecting to AI worker...');
        setWorkerProgress(0);

        try {
            // 1. Trigger Async Job
            const processResp = await fetch('/api/avatar/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoUrl, projectId })
            });

            if (!processResp.ok) {
                const errData = await processResp.json();
                throw new Error(errData.error || 'Server-side processing failed to start');
            }

            const { job_id } = await processResp.json();
            console.log('[Worker Hook] Started background job:', job_id);

            // 2. Polling Loop
            let workerSlices = null;
            let isDone = false;
            let pollAttempts = 0;

            while (!isDone && pollAttempts < 2000) { // Max 40 mins
                pollAttempts++;
                await new Promise(r => setTimeout(r, 2000));

                try {
                    const statusResp = await fetch(`/api/avatar/status?jobId=${job_id}`);
                    if (!statusResp.ok) continue;

                    const job = await statusResp.json();

                    if (job.status === 'completed') {
                        workerSlices = job.result.slices;
                        isDone = true;
                        setWorkerProgress(100);
                        setWorkerStatus('Analysis complete!');
                    } else if (job.status === 'failed') {
                        // Crucial: Throw the specific error from the worker
                        const fatalError = job.error || 'AI worker failed processing';
                        setError(fatalError);
                        throw new Error(fatalError);
                    } else {
                        setWorkerStatus(job.message || 'AI is thinking...');
                        if (job.progress > 0) setWorkerProgress(job.progress);
                    }
                } catch (e: any) {
                    if (e.message?.includes('failed processing') || e.message === error) throw e;
                    console.warn('[Worker Hook] Polling retry:', e.message);
                }
            }

            if (!workerSlices) throw new Error('Processing timed out. Please try again.');

            setWorkerStatus('Weaving narrative template...');
            // 3. Finalize Project
            await createTemplateProject(projectId, workerSlices, settings);

            return { success: true };

        } catch (err: any) {
            console.error('[Worker Hook] Processing failed:', err);
            setError(err.message || 'An unknown error occurred during AI analysis.');
            throw err;
        } finally {
            setIsProcessing(false);
        }
    }, []);

    return {
        processVideo,
        workerStatus,
        workerProgress,
        isProcessing,
        error,
        setWorkerStatus,
        setWorkerProgress
    };
}
