'use client';

import { useState } from 'react';
import { ArrowLeft, Upload, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getSignedUploadUrl } from '@/actions/uploadMediaChunk';
import { initializeTemplateProject } from '@/actions/initializeTemplateProject';
import { createTemplateProject } from '@/actions/createTemplateProject';
import { ProjectSettings } from '@/types';
import { useAvatarWorker } from '@/hooks/useAvatarWorker';

export default function AvatarTemplateFlow({ onBack }: { onBack: () => void }) {
    const router = useRouter();
    const [status, setStatus] = useState<'idle' | 'processing' | 'error' | 'success'>('idle');
    const [progressStatus, setProgressStatus] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);

    const { 
        processVideo, 
        workerStatus, 
        workerProgress, 
        isProcessing: isWorkerProcessing 
    } = useAvatarWorker();
    const [settings, setSettings] = useState<ProjectSettings>({
        aspectRatio: '16:9',
        visualStyle: 'reference_image',
        referenceCharacter: 'grandpa',
        imageModel: 'runware',
        audioVoice: 'default',
        disclaimerEnabled: false,
        longSentenceBreak: false,
        headingsEnabled: false,
        captions: {
            enabled: true, position: 'center', font: 'helvetica', fontSize: 'medium',
            animation: 'bounce', strokeWidth: 'thin', style: 'word_pop', color: '#ffcc00'
        },
        audioWave: { enabled: false, position: 'bottom', style: 'bars', color: '#ffcc00' },
        transitions: { mode: 'specific', type: 'crossfade' }
    });

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setStatus('processing');
            setUploadProgress(0);
            
            // 1. Initialize the Project Row first
            setProgressStatus('Acquiring secure vault container...');
            const { projectId } = await initializeTemplateProject(settings);

            // 2. Setup Deterministic Raw Filename
            const fileExt = file.name.substring(file.name.lastIndexOf('.'));
            const rawFileName = `${projectId}/raw_source_avatar${fileExt}`;
            const supabase = createClient();

            // 3. Resume Logic: Check if raw file already exists
            setProgressStatus('Checking for existing upload...');
            const { data: existingFiles } = await supabase.storage
                .from('projects')
                .list(projectId, { search: 'raw_source_avatar' });

            const alreadyUploaded = existingFiles && existingFiles.length > 0;

            if (alreadyUploaded) {
                console.log('[Flow] Found existing raw video, skipping upload.');
                setProgressStatus('Found existing upload. Resuming...');
                setUploadProgress(100);
            } else {
                // 4. Upload with Progress Tracking
                setProgressStatus('Uploading raw video for server-side analysis...');
                const { signedUrl } = await getSignedUploadUrl(rawFileName);

                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percent = Math.round((event.loaded / event.total) * 100);
                            setUploadProgress(percent);
                        }
                    };
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
                        else reject(new Error(`Upload failed with status ${xhr.status}`));
                    };
                    xhr.onerror = () => reject(new Error('Network error during upload'));
                    
                    xhr.open('PUT', signedUrl);
                    xhr.setRequestHeader('Content-Type', file.type);
                    xhr.setRequestHeader('x-upsert', 'true');
                    xhr.send(file);
                });
            }

            // 5. Trigger Server-Side Processing (Worker hook)
            setProgressStatus('Connecting to AI worker...');
            const { data: { publicUrl: rawVideoUrl } } = supabase.storage.from('projects').getPublicUrl(rawFileName);

            await processVideo(projectId, rawVideoUrl, settings);

            setStatus('success');
            router.push(`/project/${projectId}`);
        } catch (error: any) {
            console.error('Avatar Template Failed:', error);
            setStatus('error');
            const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
            setErrorMessage(
                error.message || 'An unknown error occurred during processing.' +
                (error.message?.includes('fetch') && isApple ? "\n\nTIP: If you're on a Mac, ensure the file is fully downloaded from iCloud before uploading." : "")
            );
        }
    };

    const effectiveProgress = workerProgress > 0 ? workerProgress : uploadProgress;
    const effectiveMessage = workerStatus || progressStatus;

    return (
        <div className="animate-in fade-in slide-in-from-right-8 duration-500">
            <button
                onClick={onBack}
                disabled={status === 'processing'}
                className="flex items-center text-sm text-stone-500 hover:text-white mb-6 transition-colors disabled:opacity-50"
            >
                <ArrowLeft size={16} className="mr-2" /> Back to Templates
            </button>

            <div className="max-w-2xl mx-auto bg-stone-900/60 backdrop-blur-md border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-700 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-900/30">
                        <Sparkles size={28} />
                    </div>
                    <h2 className="text-3xl font-bold font-serif mb-3">Avatar Interleave</h2>
                    <p className="text-stone-400 text-sm max-w-md mx-auto leading-relaxed">
                        Upload your raw monologue video. We'll utilize our server-side AI to transcribe your speech and slice the video into semantic scenes, ready to interweave with generated B-roll.
                    </p>
                </div>

                {status === 'idle' && (
                    <div className="space-y-6">
                        {/* Settings Panel */}
                        <div className="bg-stone-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 text-left">
                            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                                <Sparkles size={16} className="text-orange-500" />
                                <span className="text-sm font-semibold text-stone-300 uppercase tracking-widest">B-Roll AI Config</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Visual Style</label>
                                    <select
                                        value={settings.visualStyle}
                                        onChange={(e) => {
                                            const newStyle = e.target.value as any;
                                            const updates: any = { visualStyle: newStyle };
                                            if (newStyle === 'reference_image') {
                                                updates.imageModel = 'runware';
                                            } else if (newStyle === 'james_finetuned') {
                                                updates.imageModel = 'replicate';
                                            } else if (newStyle === 'grandma_finetuned') {
                                                updates.imageModel = 'jamestok:235@6656';
                                            }
                                            setSettings({ ...settings, ...updates });
                                        }}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
                                    >
                                        <option value="zen">Zen Monk</option>
                                        <option value="normal">Cinematic (Realistic)</option>
                                        <option value="stick">Stick Figure (Minimal)</option>
                                        <option value="cartoon">Cartoon / Vector</option>
                                        <option value="health">Medical / Health</option>
                                        <option value="art">Pop Art / Retro</option>
                                        <option value="stock_natural">Stock + AI (Natural)</option>
                                        <option value="stock_vector">Stock + AI (Vector)</option>
                                        <option value="stock_art">Stock + AI (Art)</option>
                                        <option value="clean_illustration">Clean Illustration</option>
                                        <option value="thick_stick_color">Thick Stick (Colored)</option>
                                        <option value="thick_stick_bw">Thick Stick (B&W)</option>
                                        <option value="james_finetuned">James Finetuned</option>
                                        <option value="grandma_finetuned">Grandma Finetuned</option>
                                        <option value="dark_animated">Dark Animated (Psychology)</option>
                                        <option value="reference_image">Reference Character</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Visual Engine</label>
                                    <select
                                        value={settings.imageModel}
                                        onChange={(e) => setSettings({ ...settings, imageModel: e.target.value as any })}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
                                    >
                                        {settings.visualStyle === 'james_finetuned' ? (
                                            <>
                                                <option value="replicate">Replicate (James)</option>
                                                <option value="jamestok:224@4455">James Shnell</option>
                                                <option value="jamestok:333@3453">James Dev</option>
                                            </>
                                        ) : settings.visualStyle === 'grandma_finetuned' ? (
                                            <>
                                                <option value="jamestok:235@6656">Grandma Shnell</option>
                                                <option value="jamestok:235@6656#schnell">Grandma Dev</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="fal">Fal.ai (Flux Pro)</option>
                                                <option value="runware">Runware (Fast)</option>
                                                <option value="gemini">Google Gemini 2.5</option>
                                                <option value="imagen">Google Imagen 4.0 Fast</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                {settings.visualStyle === 'reference_image' && (
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Character</label>
                                        <select
                                            value={settings.referenceCharacter || 'grandpa'}
                                            onChange={(e) => setSettings({ ...settings, referenceCharacter: e.target.value as any })}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
                                        >
                                            <option value="grandpa">Grandpa</option>
                                            <option value="grandma">Grandma</option>
                                            <option value="james">James</option>
                                            <option value="dr_sticky">Dr. Sticky</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* Long Sentence Break Toggle */}
                            <div className="bg-stone-800/40 hover:bg-stone-800/60 transition-colors rounded-xl p-4 border border-white/5 mt-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-semibold text-stone-200">Long Sentence Break</span>
                                        </div>
                                        <p className="text-xs text-stone-500">Generate 2 AI images for B-Roll scenes longer than 20 words to keep visuals dynamic.</p>
                                    </div>
                                    <button
                                        onClick={() => setSettings({ ...settings, longSentenceBreak: !settings.longSentenceBreak })}
                                        className={`w-12 h-6 rounded-full relative transition-all duration-300 flex-shrink-0 ${settings.longSentenceBreak ? 'bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30' : 'bg-stone-700'}`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-lg ${settings.longSentenceBreak ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Upload Zone */}
                        <div className="relative group">
                            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <label className="relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-stone-700/50 hover:border-orange-500/50 rounded-2xl cursor-pointer bg-stone-950/50 transition-all duration-300">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                                    <div className="w-12 h-12 bg-stone-900 rounded-full flex items-center justify-center text-stone-400 mb-4 group-hover:text-orange-400 group-hover:scale-110 transition-all duration-300">
                                        <Upload size={20} />
                                    </div>
                                    <p className="mb-2 text-sm text-stone-300 font-medium">Click to upload raw monologue</p>
                                    <p className="text-xs text-stone-500">MP4, MOV, or WEBM (Max 3-5 mins recommended)</p>
                                </div>
                                <input type="file" className="hidden" accept="video/mp4,video/quicktime,video/webm" onChange={handleFileUpload} />
                            </label>
                        </div>
                    </div>
                )}

                {status === 'processing' && (
                    <div className="flex flex-col items-center justify-center py-12 w-full max-w-md mx-auto">
                        <Loader2 size={40} className="text-orange-500 animate-spin mb-6" />
                        
                        {effectiveProgress > 0 && effectiveProgress < 100 ? (
                            <div className="w-full mb-6">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-xs font-bold text-stone-500 uppercase tracking-tighter">
                                        {workerProgress > 0 ? 'AI Processing' : 'Uploading to Cloud'}
                                    </span>
                                    <span className="text-sm font-bold text-orange-500">{effectiveProgress}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-300 ease-out" 
                                        style={{ width: `${effectiveProgress}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <h3 className="text-lg font-semibold text-white mb-2">
                                {effectiveProgress === 100 ? 'AI Analysis in Progress' : 'Preparing Assets'}
                            </h3>
                        )}
                        
                        <p className="text-sm text-stone-400 max-w-xs text-center animate-pulse">{effectiveMessage}</p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="w-12 h-12 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                            <AlertCircle size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">Processing Failed</h3>
                        <p className="text-sm text-stone-400 max-w-sm mb-6">{errorMessage}</p>
                        <button
                            onClick={() => setStatus('idle')}
                            className="px-6 py-2 bg-stone-800 hover:bg-stone-700 rounded-lg text-sm font-medium transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
