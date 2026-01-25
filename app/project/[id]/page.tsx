'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ProjectApi, SceneApi, ProjectSettings } from '@/types';
import { generateScene } from '@/actions/generateScene';
import { updateProjectSettings } from '@/actions/updateProjectSettings';
import { regenerateAudio } from '@/actions/regenerateAudio';
import { regenerateImage } from '@/actions/regenerateImage';
import { Player } from '@remotion/player';
import { MainComposition } from '@/remotion/MainComposition';
import { ChevronLeft, Play, LayoutList, Image as ImageIcon, Music, Type, AlertCircle, Sparkles, ChevronDown, Loader2, Wand2, Settings, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import RenderingModal from '@/components/RenderingModal';

export default function ProjectPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;
    const supabase = createClient();

    const [project, setProject] = useState<ProjectApi | null>(null);
    const [scenes, setScenes] = useState<SceneApi[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState(0);
    const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
    const [showScript, setShowScript] = useState(false);
    const [showCredits, setShowCredits] = useState(false);
    const [regeneratingAudio, setRegeneratingAudio] = useState<string | null>(null);
    const [regeneratingImage, setRegeneratingImage] = useState<string | null>(null);
    const [rendering, setRendering] = useState(false);
    const [renderProgress, setRenderProgress] = useState<any>(null);
    const [showRenderModal, setShowRenderModal] = useState(false);
    const playerRef = useRef<any>(null);

    // Load Project Data
    useEffect(() => {
        const loadProject = async () => {
            const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).single();
            if (proj) {
                setProject(proj);
                // Load existing scenes
                const { data: scns } = await supabase.from('scenes').select('*').eq('project_id', projectId).order('order_index');
                if (scns) setScenes(scns);
            } else {
                router.push('/');
            }
            setLoading(false);
        };
        loadProject();

        // Subscribe to realtime updates for projects (to get video_url)
        const projectChannel = supabase.channel(`project-${projectId}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
                (payload) => {
                    console.log('Project updated:', payload.new);
                    setProject(payload.new as ProjectApi);
                    if (payload.new.status === 'done' && payload.new.video_url) {
                        setRendering(false);
                    }
                })
            .subscribe();

        // Subscribe to realtime updates for scenes
        const channel = supabase.channel(`scenes-${projectId}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'scenes', filter: `project_id=eq.${projectId}` },
                (payload) => {
                    console.log('Scene inserted:', payload.new);
                    setScenes(prev => {
                        const existing = prev.find(s => s.id === payload.new.id);
                        if (existing) return prev;
                        return [...prev, payload.new as SceneApi].sort((a, b) => a.order_index - b.order_index);
                    });
                })
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'scenes', filter: `project_id=eq.${projectId}` },
                (payload) => {
                    console.log('Scene updated:', payload.new);
                    setScenes(prev => prev.map(s => s.id === payload.new.id ? payload.new as SceneApi : s));
                })
            .on('postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'scenes', filter: `project_id=eq.${projectId}` },
                (payload) => {
                    console.log('Scene deleted:', payload.old);
                    setScenes(prev => prev.filter(s => s.id !== payload.old.id));
                })
            .subscribe();

        // POLL FOR RENDER PROGRESS
        let progressInterval: NodeJS.Timeout;
        if (project?.status === 'rendering' || rendering) {
            setRendering(true);
            setShowRenderModal(true);
            progressInterval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/render/${projectId}/status`, { cache: 'no-store' });
                    const data = await res.json();

                    if (data.progress !== undefined) {
                        setRenderProgress(data);
                    }

                    // Check for status change (done/error)
                    if (data.status === 'done' || data.status === 'error') {
                        clearInterval(progressInterval);

                        // Update local project state immediately
                        setProject((prev: any) => ({
                            ...prev,
                            status: data.status,
                            video_url: data.videoUrl || prev?.video_url
                        }));
                        setRendering(false);
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 1000);
        }

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(projectChannel);
            if (progressInterval) clearInterval(progressInterval);
        };
    }, [projectId, router, project?.status, rendering]); // Added rendering dependency

    const [generationLog, setGenerationLog] = useState<string>("");

    const handleGenerate = async () => {
        if (!project) return;
        setGenerating(true);
        setGenProgress(0);
        setGenerationLog("Initializing generation...");

        try {
            // 1. Split Script (Simple regex)
            const sentences = project.script.match(/[^.!?]+[.!?]+/g) || [project.script];

            let generatedCount = 0;

            // 2. Iterate and Generate
            for (let i = 0; i < sentences.length; i++) {
                const text = sentences[i].trim();
                if (!text) continue;

                // Skip if already generated
                if (scenes.find(s => s.order_index === i)) {
                    setGenProgress(((i + 1) / sentences.length) * 100);
                    continue;
                }

                // Rate Limit Check
                if (generatedCount > 0 && generatedCount % 40 === 0) {
                    setGenerationLog(`Rate limit pause: Waiting 60 seconds before continuing...`);
                    await new Promise(resolve => setTimeout(resolve, 60000));
                    setGenerationLog("Resuming generation...");
                }

                setGenerationLog(`Generating scene ${i + 1} of ${sentences.length}...`);

                // Call Server Action
                const result = await generateScene(projectId, i, text, project.settings);

                if (!result.success || !result.scene) {
                    setGenerationLog(`Error generating scene ${i + 1}: ${result.error}`);
                    toast.error(`Error generating scene ${i + 1}: ${result.error}`);
                    break;
                }

                // OPTIMISTIC UPDATE: Add the new scene to state immediately
                setScenes(prev => {
                    const existing = prev.find(s => s.id === result.scene!.id);
                    if (existing) return prev;
                    return [...prev, result.scene!].sort((a, b) => a.order_index - b.order_index);
                });

                generatedCount++;
                setGenProgress(((i + 1) / sentences.length) * 100);
            }
            setGenerationLog("Generation complete!");
        } catch (e) {
            console.error(e);
            setGenerationLog("Generation failed due to an error.");
            toast.error("Generation failed");
        } finally {
            setGenerating(false);
            setTimeout(() => setGenerationLog(""), 5000);
        }
    };

    const handleContinueGeneration = async () => {
        if (!project) return;
        setGenerating(true);
        setGenProgress(0);
        setGenerationLog("Analyzing missing content...");

        try {
            const sentences = project.script.match(/[^.!?]+[.!?]+/g) || [project.script];
            let generatedCount = 0;

            for (let i = 0; i < sentences.length; i++) {
                const text = sentences[i].trim();
                if (!text) continue;

                // Update progress
                setGenProgress(((i) / sentences.length) * 100);

                // Use current state 'scenes' (snapshot) to decide what to do
                // Note: We search the *original* list. If we fix something, we won't see the update in 'scenes' variable 
                // until next render, but that's fine for sequential processing.
                const existingScene = scenes.find(s => s.order_index === i);

                // 1. Missing Scene
                if (!existingScene) {
                    setGenerationLog(`Generating missing scene ${i + 1}...`);
                    await performGeneration(i, text);
                    generatedCount++;
                }
                // 2. Error Scene
                else if (existingScene.status === 'error') {
                    setGenerationLog(`Retrying failed scene ${i + 1}...`);
                    // Delete first to avoid conflicts/cleanup
                    await supabase.from('scenes').delete().eq('id', existingScene.id);
                    // Update local UI to remove it temporarily
                    setScenes(prev => prev.filter(s => s.id !== existingScene.id));

                    await performGeneration(i, text);
                    generatedCount++;
                }
                // 3. Asset Checks on Existing Ready/Pending Scenes
                else {
                    let didWork = false;
                    // Check Audio
                    if (!existingScene.audio_url) {
                        setGenerationLog(`Restoring audio for scene ${i + 1}...`);
                        await handleRegenerateAudio(existingScene.id, text, i);
                        didWork = true;
                    }

                    // Check Image (Visuals)
                    if (!existingScene.image_url) {
                        setGenerationLog(`Restoring visuals for scene ${i + 1}...`);
                        await handleRegenerateImage(existingScene.id, text, i);
                        didWork = true;
                    }

                    if (didWork) generatedCount++;
                }

                // Rate Limit
                if (generatedCount > 0 && generatedCount % 10 === 0) {
                    setGenerationLog(`Pausing for rate limits (10s)...`);
                    await new Promise(r => setTimeout(r, 10000));
                }
            }
            setGenerationLog("All scenes checked and generated!");
            setGenProgress(100);
        } catch (e) {
            console.error(e);
            toast.error("Continue generation interrupted");
        } finally {
            setGenerating(false);
            setTimeout(() => {
                setGenerationLog("");
                setGenProgress(0);
            }, 3000);
        }
    };

    const performGeneration = async (index: number, text: string) => {
        if (!project) return;

        const result = await generateScene(projectId, index, text, project.settings);

        if (!result.success || !result.scene) {
            toast.error(`Error generating scene ${index + 1}: ${result.error}`);
            // Don't break loop, just continue to next try or let user retry
            return;
        }

        setScenes(prev => {
            const existing = prev.find(s => s.id === result.scene!.id);
            if (existing) return prev;
            return [...prev, result.scene!].sort((a, b) => a.order_index - b.order_index);
        });
    };

    const handleUpdateSettings = async (newSettings: Partial<ProjectSettings>) => {
        if (!project) return;

        const result = await updateProjectSettings(projectId, newSettings);
        if (result.success && result.settings) {
            setProject({ ...project, settings: result.settings });
        } else {
            toast.error(`Failed to update settings: ${result.error}`);
        }
    };

    const handleRegenerateAudio = async (sceneId: string, text: string, sceneIndex: number) => {
        if (!project) return;
        setRegeneratingAudio(sceneId);
        try {
            const result = await regenerateAudio(sceneId, text, project.settings.audioVoice, projectId, sceneIndex);
            if (result.success) {
                // Reload scenes to get updated data
                const { data: scns } = await supabase.from('scenes').select('*').eq('project_id', projectId).order('order_index');
                if (scns) setScenes(scns);
            } else {
                toast.error(`Failed to regenerate audio: ${result.error}`);
            }
        } catch (e: any) {
            toast.error(`Error: ${e.message}`);
        } finally {
            setRegeneratingAudio(null);
        }
    };

    const handleRegenerateImage = async (sceneId: string, text: string, sceneIndex: number) => {
        if (!project) return;
        setRegeneratingImage(sceneId);
        try {
            const result = await regenerateImage(sceneId, text, project.settings.visualStyle, project.settings.imageModel, projectId, sceneIndex, project.settings.aspectRatio);
            if (result.success) {
                // Reload scenes
                const { data: scns } = await supabase.from('scenes').select('*').eq('project_id', projectId).order('order_index');
                if (scns) setScenes(scns);
            } else {
                toast.error(`Failed to regenerate image: ${result.error}`);
            }
        } catch (e: any) {
            toast.error(`Error: ${e.message}`);
        } finally {
            setRegeneratingImage(null);
        }
    };

    const handleExportVideo = async () => {
        if (!project) return;
        setRendering(true);
        setShowRenderModal(true);

        // Optimistic Update
        setProject(prev => prev ? ({ ...prev, status: 'rendering' }) : null);

        try {
            // Call API route to trigger async render
            const response = await fetch(`/api/render/${projectId}`, { method: 'GET' });

            if (!response.ok) {
                let errorMsg = 'Export failed';
                try {
                    const error = await response.json();
                    errorMsg = error.error || error.message || errorMsg;
                } catch {
                    const text = await response.text();
                    errorMsg = text || errorMsg;
                }
                throw new Error(errorMsg);
            }

            // Success - just notify user
            toast.success("Rendering started! This may take a few minutes. You can close this tab or wait here.");
            toast.info("The 'Download Video' button will appear when it's ready.");

        } catch (e: any) {
            toast.error(`Export error: ${e.message}`);
            setRendering(false);
            // Revert optimistic update on error
            setProject(prev => prev ? ({ ...prev, status: 'ready' as any }) : null);
        }
    };

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-stone-500">Loading Workspace...</div>;
    if (!project) return null;

    return (
        <div className="min-h-screen bg-stone-950 text-stone-200 font-sans flex flex-col h-screen overflow-hidden">

            {/* HEADER */}
            <header className="bg-stone-950/95 backdrop-blur-sm border-b border-white/10 p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/')} className="text-stone-400 hover:text-stone-200 transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-lg font-bold text-stone-200">Video Studio</h1>
                </div>
                <div className="flex items-center gap-3">
                    {(project.settings.visualStyle === 'stock_natural' || project.settings.visualStyle === 'stock_vector' || project.settings.visualStyle === 'stock_art') && (
                        <button
                            onClick={() => setShowCredits(!showCredits)}
                            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${showCredits ? 'bg-orange-600 text-white' : 'bg-stone-800 hover:bg-stone-700 text-stone-200'}`}
                        >
                            <Sparkles size={16} />
                            Artists
                        </button>
                    )}
                    <button
                        onClick={() => setShowScript(!showScript)}
                        className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors flex items-center gap-2 text-sm"
                    >
                        <LayoutList size={16} />
                        {showScript ? 'Hide' : 'Show'} Script
                    </button>
                    {project.video_url ? (
                        <a
                            href={project.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                            <Download size={16} />
                            Download Video
                        </a>
                    ) : (
                        <button
                            onClick={handleExportVideo}
                            disabled={rendering || project.status === 'rendering' || scenes.filter(s => s.status === 'ready').length === 0}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                            {rendering || project.status === 'rendering' ? (
                                <div className="flex flex-col items-start text-xs">
                                    <div className="flex items-center gap-2">
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Rendering on AWS Lambda...</span>
                                    </div>
                                    {renderProgress && renderProgress.progress > 0 && (
                                        <span className="text-white/70 ml-6 text-[10px]">
                                            {Math.round(renderProgress.progress * 100)}%
                                            {renderProgress.details?.framesRendered ? ` (${renderProgress.details.framesRendered} frames)` : ''}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <Download size={16} />
                                    Export Video
                                </>
                            )}
                        </button>
                    )}
                    <div className={`px-3 py-1.5 rounded-full text-xs font-mono border ${project.status === 'done' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                        project.status === 'generating' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
                            project.status === 'rendering' ? 'bg-purple-500/10 border-purple-500/20 text-purple-500' :
                                project.status === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                    'bg-stone-800 border-stone-700 text-stone-500'
                        }`}>
                        {project.status.toUpperCase()}
                    </div>
                </div>
            </header>

            {showScript && (
                <div className="border-b border-white/5 bg-stone-900/30 p-6 animate-in slide-in-from-top-2 max-h-[60vh] overflow-y-auto">
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Original Scripture</h3>
                            <span className="text-xs text-stone-500">{scenes.length} {scenes.length === 1 ? 'Scene' : 'Scenes'}</span>
                        </div>
                        <p className="text-stone-300 font-serif leading-relaxed opacity-80 max-w-4xl">{project.script}</p>
                    </div>
                </div>
            )}

            {showCredits && (
                <div className="border-b border-white/5 bg-stone-900/30 p-6 animate-in slide-in-from-top-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-2">
                            <Sparkles size={14} /> Artist Credits
                        </h3>
                        <button
                            onClick={() => {
                                const text = scenes
                                    .filter(s => s.attribution)
                                    .map(s => `${s.attribution}`)
                                    .join('\n');
                                navigator.clipboard.writeText("Credits:\n" + text);
                                toast.success("Credits copied to clipboard!");
                            }}
                            className="text-xs bg-stone-800 hover:bg-stone-700 px-3 py-1.5 rounded transition-colors"
                        >
                            Copy All
                        </button>
                    </div>
                    <div className="bg-black/50 p-4 rounded-lg font-mono text-xs text-stone-400 whitespace-pre-wrap select-all">
                        {scenes.filter(s => s.attribution).length > 0 ? (
                            <>
                                <div className="mb-2 text-stone-500">// Copy and paste into your video description</div>
                                {scenes.filter(s => s.attribution).map((s, i) => (
                                    <div key={s.id}>{s.attribution}</div>
                                ))}
                            </>
                        ) : (
                            <div className="text-stone-600">No artist attributions found for these scenes.</div>
                        )}
                    </div>
                </div>
            )}


            <div className="flex flex-1 overflow-hidden">

                {/* LEFT: Sidebar Scenes */}
                <div className="w-[350px] border-r border-white/5 bg-stone-900/30 flex flex-col flex-shrink-0">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-2">
                            <LayoutList size={14} /> Storyboard ({scenes.length})
                        </span>
                        {generating && (
                            <div className="flex flex-col items-end">
                                <span className="text-xs text-orange-500 animate-pulse">{Math.round(genProgress)}%</span>
                                <span className="text-[10px] text-stone-500">{generationLog}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                        {scenes.length === 0 && !generating && (
                            <div className="text-center py-10 px-6">
                                <p className="text-stone-500 text-sm mb-4">No scenes generated yet.</p>
                                <button
                                    onClick={handleGenerate}
                                    className="w-full bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold py-3 rounded-lg shadow-lg border-b-2 border-orange-800 transition-all active:translate-y-[1px] active:border-b-0"
                                >
                                    Generate Visuals
                                </button>
                            </div>
                        )}

                        {scenes.map((scene, idx) => (
                            <div key={scene.id} className={`bg-stone-900 border p-3 rounded-lg transition-all cursor-pointer ${expandedSceneId === scene.id ? 'border-orange-500/50' : 'border-white/5 hover:border-orange-500/30'}`}>
                                <div className="flex gap-3 items-start" onClick={() => setExpandedSceneId(expandedSceneId === scene.id ? null : scene.id)}>
                                    {/* Thumbnail */}
                                    <div className="w-16 h-16 bg-black rounded-md overflow-hidden flex-shrink-0 relative border border-white/5">
                                        {scene.image_url ? (
                                            (scene.media_type === 'video' || scene.image_url.includes('.mp4')) ? (
                                                <video
                                                    src={scene.image_url}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                    loop
                                                    autoPlay
                                                    playsInline
                                                />
                                            ) : (
                                                <img src={scene.image_url} className="w-full h-full object-cover" alt={`Scene ${idx + 1}`} />
                                            )
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-red-500 bg-red-500/10">
                                                <AlertCircle size={16} />
                                            </div>
                                        )}
                                        {!scene.audio_url && (
                                            <div className="absolute bottom-0 right-0 bg-red-500 p-0.5 rounded-tl">
                                                <Music size={8} className="text-white" />
                                            </div>
                                        )}
                                        <div className="absolute top-0 left-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-mono">
                                            #{idx + 1}
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <p className="text-xs text-stone-300 line-clamp-2 font-medium leading-relaxed mb-1">
                                            "{scene.text}"
                                        </p>
                                        <div className="flex items-center gap-2 text-[10px] text-stone-600">
                                            {scene.audio_url && <Music size={10} className="text-green-500/50" />}
                                            {scene.prompt && <span className="truncate max-w-[100px]">{scene.visual_style || 'Zen'}</span>}
                                        </div>
                                    </div>
                                    <ChevronDown size={16} className={`text-stone-500 transition-transform ${expandedSceneId === scene.id ? 'rotate-180' : ''}`} />
                                </div>

                                {expandedSceneId === scene.id && (
                                    <div className="mt-3 pt-3 border-t border-white/5 text-xs space-y-2 animate-in fade-in slide-in-from-top-2">
                                        <div>
                                            <span className="font-semibold text-stone-400">Prompt:</span> <span className="text-stone-300">{scene.prompt || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-stone-400">Visual Style:</span> <span className="text-stone-300">{scene.visual_style || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-stone-400">Duration:</span> <span className="text-stone-300">{scene.duration?.toFixed(1)}s</span>
                                        </div>

                                        {/* Audio Section */}
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-stone-400">Audio:</span>
                                            <button
                                                onClick={() => handleRegenerateAudio(scene.id, scene.text, scene.order_index)}
                                                disabled={regeneratingAudio === scene.id}
                                                className="flex items-center gap-1 px-2 py-1 bg-stone-800 hover:bg-stone-700 rounded text-[10px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {regeneratingAudio === scene.id ? (
                                                    <><Loader2 size={10} className="animate-spin" /> Regenerating...</>
                                                ) : (
                                                    <><RefreshCw size={10} /> Regenerate</>
                                                )}
                                            </button>
                                        </div>
                                        {scene.audio_url && (
                                            <div>
                                                <audio controls className="w-full h-8" src={scene.audio_url}>
                                                    Your browser does not support audio.
                                                </audio>
                                            </div>
                                        )}
                                        {!scene.audio_url && (
                                            <div className="flex items-center gap-1 text-red-500 text-[10px]">
                                                <AlertCircle size={10} /> Audio missing
                                            </div>
                                        )}

                                        {/* Image Section */}
                                        <div className="flex items-center justify-between pt-2">
                                            <span className="font-semibold text-stone-400">Image:</span>
                                            <button
                                                onClick={() => handleRegenerateImage(scene.id, scene.text, scene.order_index)}
                                                disabled={regeneratingImage === scene.id}
                                                className="flex items-center gap-1 px-2 py-1 bg-stone-800 hover:bg-stone-700 rounded text-[10px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {regeneratingImage === scene.id ? (
                                                    <><Loader2 size={10} className="animate-spin" /> Regenerating...</>
                                                ) : (
                                                    <><RefreshCw size={10} /> Regenerate</>
                                                )}
                                            </button>
                                        </div>
                                        {!scene.image_url && (
                                            <div className="flex items-center gap-1 text-red-500 text-[10px]">
                                                <AlertCircle size={10} /> Image missing
                                            </div>
                                        )}

                                        {scene.status === 'error' && (
                                            <div className="flex items-center gap-1 text-red-500 pt-2">
                                                <AlertCircle size={12} /> Generation Failed
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {generating && (
                            <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg animate-pulse">
                                <div className="h-2 w-2/3 bg-orange-500/20 rounded mb-2"></div>
                                <div className="h-10 w-full bg-orange-500/10 rounded"></div>
                            </div>
                        )}
                    </div>
                    {scenes.length > 0 && !generating && (
                        <div className="p-2 border-t border-white/5">
                            <button
                                onClick={handleContinueGeneration}
                                className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded border border-white/5 transition-all flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={12} />
                                Continue / Fix Generation
                            </button>
                        </div>
                    )}
                </div>

                {/* CENTER: Player */}
                <div className="flex-1 bg-black/40 flex flex-col">
                    <div className="bg-stone-900/95 border-b border-white/10 p-3 flex flex-wrap items-center gap-x-4 gap-y-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">Caption Settings:</span>

                        {/* Caption Toggle - Improved Styling */}
                        <label className="relative inline-flex items-center gap-2 cursor-pointer group whitespace-nowrap">
                            <input
                                type="checkbox"
                                checked={project.settings.captions.enabled}
                                onChange={(e) => handleUpdateSettings({
                                    captions: { ...project.settings.captions, enabled: e.target.checked }
                                })}
                                className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-stone-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-500/50 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                            <span className="text-xs text-stone-300">Show</span>
                        </label>

                        {/* Font */}
                        <select
                            value={project.settings.captions.font}
                            onChange={(e) => handleUpdateSettings({
                                captions: { ...project.settings.captions, font: e.target.value as any }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1"
                            disabled={!project.settings.captions.enabled}
                        >
                            <option value="sans">Sans</option>
                            <option value="serif">Serif</option>
                            <option value="brush">Brush</option>
                        </select>

                        {/* Size */}
                        <select
                            value={project.settings.captions.fontSize || 'medium'}
                            onChange={(e) => handleUpdateSettings({
                                captions: { ...project.settings.captions, fontSize: e.target.value as any }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1"
                            disabled={!project.settings.captions.enabled}
                        >
                            <option value="small">S</option>
                            <option value="medium">M</option>
                            <option value="large">L</option>
                            <option value="xlarge">XL</option>
                        </select>

                        {/* Position */}
                        <select
                            value={project.settings.captions.position}
                            onChange={(e) => handleUpdateSettings({
                                captions: { ...project.settings.captions, position: e.target.value as any }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1"
                            disabled={!project.settings.captions.enabled}
                        >
                            <option value="top">Top</option>
                            <option value="center">Center</option>
                            <option value="mid-bottom">Mid-Bottom</option>
                            <option value="bottom">Bottom</option>
                        </select>

                        {/* Animation */}
                        <select
                            value={project.settings.captions.animation || 'typewriter'}
                            onChange={(e) => handleUpdateSettings({
                                captions: { ...project.settings.captions, animation: e.target.value as any }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1"
                            disabled={!project.settings.captions.enabled}
                        >
                            <option value="none">None</option>
                            <option value="typewriter">Typewriter</option>
                            <option value="fade-in">Fade In</option>
                            <option value="slide-up">Slide Up</option>
                            <option value="bounce">Bounce</option>
                        </select>

                        {/* Stroke/Weight */}
                        <select
                            value={project.settings.captions.strokeWidth || 'medium'}
                            onChange={(e) => handleUpdateSettings({
                                captions: { ...project.settings.captions, strokeWidth: e.target.value as any }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1"
                            disabled={!project.settings.captions.enabled}
                        >
                            <option value="thin">Thin</option>
                            <option value="medium">Medium</option>
                            <option value="thick">Thick</option>
                            <option value="bold">Bold</option>
                        </select>


                        {/* Divider */}
                        <div className="h-6 w-px bg-white/10"></div>

                        {/* AUDIO WAVE SETTINGS */}
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={project.settings.audioWave?.enabled ?? false}
                                onChange={(e) => handleUpdateSettings({
                                    audioWave: {
                                        ...(project.settings.audioWave || { position: 'bottom', style: 'bars', color: '#ff5500' }),
                                        enabled: e.target.checked
                                    }
                                })}
                                className="toggle"
                            />
                            <span className="text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">Audio Wave:</span>
                        </div>



                        {/* Wave Position */}
                        <select
                            value={project.settings.audioWave?.position || 'bottom'}
                            onChange={(e) => handleUpdateSettings({
                                audioWave: {
                                    ...(project.settings.audioWave || { enabled: true, style: 'bars', color: '#ff5500' }),
                                    position: e.target.value as any
                                }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1"
                            disabled={!project.settings.audioWave?.enabled}
                        >
                            <option value="bottom">Bottom</option>
                            <option value="mid-bottom">Mid-Bottom</option>
                            <option value="center">Center</option>
                            <option value="top">Top</option>
                        </select>

                        {/* Wave Color */}
                        <input
                            type="color"
                            value={project.settings.audioWave?.color || '#ff5500'}
                            onChange={(e) => handleUpdateSettings({
                                audioWave: {
                                    ...(project.settings.audioWave || { enabled: true, style: 'bars', position: 'bottom' }),
                                    color: e.target.value
                                }
                            })}
                            className="h-6 w-6 rounded cursor-pointer bg-transparent border-none p-0"
                            disabled={!project.settings.audioWave?.enabled}
                        />
                        {/* Divider */}
                        <div className="h-6 w-px bg-white/10"></div>
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">Transitions:</span>

                        {/* Transition Type */}
                        <select
                            value={project.settings.transitions.type}
                            onChange={(e) => handleUpdateSettings({
                                transitions: { ...project.settings.transitions, type: e.target.value as any }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1"
                        >
                            <option value="none">None</option>
                            <option value="fadein">Fade In</option>
                            <option value="crossfade">Crossfade</option>
                            <option value="white_flash">White Flash</option>
                            <option value="camera_flash">Camera Flash</option>
                        </select>
                        <select
                            value={project.settings.transitions.transitionSound || 'none'}
                            onChange={(e) => handleUpdateSettings({
                                transitions: { ...project.settings.transitions, transitionSound: e.target.value as any }
                            })}
                            className="bg-stone-800 border border-stone-700 text-stone-200 text-xs rounded px-2 py-1 ml-1"
                        >
                            <option value="none">No Sound</option>
                            <option value="camera_flash">🔊 Camera Flash</option>
                            <option value="swoosh">🔊 Swoosh</option>
                        </select>
                        {/* Divider */}
                        <div className="h-6 w-px bg-white/10"></div>
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 whitespace-nowrap">Camera:</span>

                        <div className="flex flex-wrap gap-1 max-w-[300px]">
                            {[
                                { id: 'zoom_in', label: 'Zoom In' },
                                { id: 'zoom_out', label: 'Zoom Out' },
                                { id: 'pan_left', label: 'Pan ←' },
                                { id: 'pan_right', label: 'Pan →' },
                                { id: 'pan_up', label: 'Pan ↑' },
                                { id: 'pan_down', label: 'Pan ↓' },
                                { id: 'static', label: 'Static' },
                            ].map((move) => {
                                const isSelected = (project.settings.cameraMovements || ['zoom_in']).includes(move.id as any);
                                return (
                                    <button
                                        key={move.id}
                                        onClick={() => {
                                            const current = project.settings.cameraMovements || ['zoom_in'];
                                            let next = [];
                                            if (isSelected) {
                                                next = current.filter(c => c !== move.id);
                                                if (next.length === 0) next = ['static']; // Prevent empty
                                            } else {
                                                // If 'static' was selected alone, remove it when adding others
                                                const noStatic = current.filter(c => c !== 'static');
                                                next = [...noStatic, move.id];
                                            }
                                            handleUpdateSettings({ cameraMovements: next as any });
                                        }}
                                        className={`px-2 py-1 text-[10px] rounded border transition-colors ${isSelected
                                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                                            : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-300'
                                            }`}
                                    >
                                        {move.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto flex items-start justify-center p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed opacity-100">
                        {scenes.length > 0 ? (
                            <div className={
                                project.settings.aspectRatio === '9:16'
                                    ? 'h-[75vh] aspect-[9/16] shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/10 bg-black relative'
                                    : 'aspect-video w-full max-w-5xl shadow-2xl rounded-xl overflow-hidden ring-1 ring-white/10 bg-black relative group'
                            }>
                                <Player
                                    key={`player-${scenes.filter(s => s.status === 'ready').length}-${project.settings.aspectRatio}`}
                                    ref={playerRef}
                                    component={MainComposition}
                                    inputProps={{
                                        scenes: scenes.filter(s => s.status === 'ready'),
                                        settings: project.settings
                                    }}
                                    compositionWidth={project.settings.aspectRatio === '9:16' ? 1080 : 1920}
                                    compositionHeight={project.settings.aspectRatio === '9:16' ? 1920 : 1080}
                                    fps={30}
                                    durationInFrames={scenes.filter(s => s.status === 'ready').reduce((acc, s) => acc + Math.ceil((s.duration || 5) * 30), 0) || 150}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                    }}
                                    controls
                                />
                            </div>
                        ) : (
                            <div className="text-center space-y-4">
                                <div className="w-20 h-20 bg-stone-900 rounded-full flex items-center justify-center mx-auto border border-white/5 shadow-2xl animate-pulse">
                                    <Sparkles size={32} className="text-orange-500/50" />
                                </div>
                                <div>
                                    <h3 className="text-white text-lg font-medium">Ready to Visualize?</h3>
                                    <p className="text-stone-500 text-sm max-w-xs mx-auto mt-2">
                                        Your script is ready. Begin the incantation to generate scenes.
                                    </p>
                                </div>
                                <button
                                    onClick={handleGenerate}
                                    disabled={generating}
                                    className="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-stone-200 transition-all flex items-center gap-2 mx-auto"
                                >
                                    {generating ? <Loader2 className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                                    {generating ? 'Weaving...' : 'Generate Scenes'}
                                </button>
                            </div>
                        )}


                    </div>
                    {/* Bottom Metadata/Controls if needed */}
                </div>
            </div>

            <RenderingModal
                isOpen={showRenderModal}
                onClose={() => setShowRenderModal(false)}
                status={project.status as any}
                progress={renderProgress?.progress || 0}
                details={renderProgress?.details}
                videoUrl={project.video_url}
                error={renderProgress?.error}
            />
        </div>
    );
}

