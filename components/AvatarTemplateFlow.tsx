'use client';

import { useState } from 'react';
import { ArrowLeft, Upload, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { transcribeVideo, sliceVideo, uploadSlices } from '@/utils/videoProcessing';
import { initializeTemplateProject } from '@/actions/initializeTemplateProject';
import { createTemplateProject } from '@/actions/createTemplateProject';
import { ProjectSettings } from '@/types';

export default function AvatarTemplateFlow({ onBack }: { onBack: () => void }) {
    const router = useRouter();
    const [status, setStatus] = useState<'idle' | 'processing' | 'error' | 'success'>('idle');
    const [progressStatus, setProgressStatus] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
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
            setProgressStatus('Loading local AI models (this takes a moment on first run)...');

            // 1. Run STT to get timestamps
            let chunks: any[];
            try {
                chunks = await transcribeVideo(file, setProgressStatus);
                if (!chunks || chunks.length === 0) throw new Error("Could not detect any speech in this video.");
            } catch (e: any) {
                throw new Error(`STT Pipeline Error: ${e.message}`);
            }

            setProgressStatus('Slicing video into semantic scenes...');
            // 2. Slice into chunks with FFmpeg
            let slices: any[];
            try {
                slices = await sliceVideo(file, chunks, setProgressStatus);
                if (slices.length === 0) throw new Error("Failed to extract valid segments.");
            } catch (e: any) {
                console.error("Caught FFmpeg error:", e);
                const msg = e?.message || e?.toString() || JSON.stringify(e) || 'Unknown WASM Error';
                throw new Error(`FFmpeg Slicing Error: ${msg}`);
            }

            setProgressStatus('Acquiring secure vault container...');
            // 3. Initialize the Project Row first (required so Storage RLS accepts the upload path)
            const { projectId } = await initializeTemplateProject();

            setProgressStatus('Uploading assets to secure vault...');
            // 4. Upload chunks to Supabase Projects Bucket
            const uploadedSlices = await uploadSlices(projectId, slices, setProgressStatus);

            setProgressStatus('Weaving narrative template...');
            // 5. Update Project and populate AI Scenes
            await createTemplateProject(projectId, uploadedSlices, settings);

            setStatus('success');
            router.push(`/project/${projectId}`);
        } catch (error: any) {
            console.error('Avatar Template Failed:', error);
            setStatus('error');
            setErrorMessage(error.message || 'An unknown error occurred during processing.');
        }
    };

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
                        Upload your raw monologue video. We'll utilize on-device AI to transcribe your speech and slice the video into semantic sentences, ready to interweave with generated B-roll.
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
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 size={40} className="text-orange-500 animate-spin mb-6" />
                        <h3 className="text-lg font-semibold text-white mb-2">Analyzing Video</h3>
                        <p className="text-sm text-stone-400 max-w-xs text-center animate-pulse">{progressStatus}</p>
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
