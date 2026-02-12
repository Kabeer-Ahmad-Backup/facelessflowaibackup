'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { ProjectSettings, ProjectApi } from '@/types';
import { deleteProject } from '@/actions/deleteProject';
import { Sparkles, Play, Clock, LayoutGrid, Plus, ChevronRight, Wand2, Type, Trash2 } from 'lucide-react';
import { VOICE_OPTIONS, CAPTION_FONTS, CAPTION_POSITIONS } from '@/lib/constants';

export default function Home() {
    const router = useRouter();
    const supabase = createClient();
    const [script, setScript] = useState('');
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<ProjectApi[]>([]);
    const [user, setUser] = useState<any>(null);

    const [credits, setCredits] = useState<number | null>(null);

    // Initial Load
    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setUser(user);

            // Fetch Profile (Credits)
            const { data: profile } = await supabase
                .from('profiles')
                .select('credits')
                .eq('id', user.id)
                .single();

            if (profile) setCredits(profile.credits);

            // Fetch Projects
            const { data } = await supabase
                .from('projects')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (data) setProjects(data);
        };
        init();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    // Settings State
    const [settings, setSettings] = useState<ProjectSettings>({
        aspectRatio: '16:9',
        visualStyle: 'zen',
        imageModel: 'fal',
        audioVoice: 'English_ManWithDeepVoice',
        disclaimerEnabled: true,
        longSentenceBreak: true,
        headingsEnabled: false,
        captions: {
            enabled: true,
            position: 'bottom',
            font: 'helvetica',
            fontSize: 'medium',
            animation: 'typewriter',
            strokeWidth: 'medium',
            style: 'classic',
            color: '#00D9FF' // Default neon blue for karaoke
        },
        audioWave: {
            enabled: false,
            position: 'bottom',
            style: 'bars',
            color: '#ffffff'
        },
        transitions: { mode: 'random', type: 'fadein' }
    });

    const handleStart = async () => {
        if (!script.trim()) return alert("Please enter wisdom to weave.");
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('projects')
                .insert({
                    user_id: user.id,
                    script,
                    settings,
                    status: 'draft'
                })
                .select()
                .single();

            if (error) throw error;
            router.push(`/project/${data.id}`);

        } catch (e: any) {
            console.error(e);
            alert("Failed to create project: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!user) return <div className="min-h-screen bg-black flex items-center justify-center text-stone-500">Loading Realm...</div>;

    return (
        <div className="min-h-screen bg-stone-950 text-stone-200 font-sans selection:bg-orange-500/30">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 opacity-20 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-600/30 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto p-6 md:p-12">

                {/* Header */}
                <header className="flex justify-between items-center mb-12 bg-stone-900/40 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-900/20">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white font-serif">FacelessFlow<span className="text-stone-500 font-sans font-light">AI</span></h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {credits !== null && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-stone-950/50 rounded-lg border border-white/5">
                                <Wand2 size={14} className="text-orange-400" />
                                <span className="text-sm font-medium text-stone-300">
                                    <span className="text-white font-bold">{credits}</span> Credits
                                </span>
                            </div>
                        )}
                        <button
                            onClick={handleLogout}
                            className="text-sm text-stone-500 hover:text-white transition-colors"
                        >
                            Log Out
                        </button>
                    </div>
                </header>

                {/* Main Creator Section (Top) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">

                    {/* LEFT: Script Input & Hero */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                        <div className="space-y-2">
                            <h2 className="text-4xl md:text-5xl font-bold text-white font-serif leading-tight">
                                Weave silence <br /> into <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">Vision.</span>
                            </h2>
                            <p className="text-stone-400 text-lg font-light max-w-md">
                                Transform your text into cinematic video narratives.
                            </p>
                        </div>

                        <div className="flex-grow flex flex-col">
                            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-2 mb-3">
                                <Wand2 size={14} /> The Scripture
                            </label>
                            <textarea
                                value={script}
                                onChange={(e) => setScript(e.target.value)}
                                className="w-full flex-grow min-h-[300px] bg-stone-900/50 backdrop-blur border border-white/10 rounded-2xl p-6 text-xl text-stone-200 placeholder:text-stone-700 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all font-serif leading-relaxed resize-none shadow-inner"
                                placeholder="Paste your story, poem, or thought here..."
                            />
                        </div>
                    </div>

                    {/* RIGHT: Settings Panel */}
                    <div className="lg:col-span-5 flex flex-col justify-end">
                        <div className="bg-stone-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6">

                            <div className="space-y-1 pb-4 border-b border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                    <span className="text-sm font-semibold text-stone-300 uppercase tracking-widest">Configuration</span>
                                </div>
                                <p className="text-xs text-stone-500 ml-4">Advanced generation settings</p>
                            </div>

                            <div className="space-y-3">
                                {/* Disclaimer Toggle */}
                                <div className="bg-stone-800/40 hover:bg-stone-800/60 transition-colors rounded-xl p-4 border border-white/5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-semibold text-stone-200">Disclaimer</span>
                                                <span className="text-xs px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded-full font-medium">Optional</span>
                                            </div>
                                            <p className="text-xs text-stone-500">Add disclaimer text at the start of video</p>
                                        </div>
                                        <button
                                            onClick={() => setSettings({ ...settings, disclaimerEnabled: !settings.disclaimerEnabled })}
                                            className={`w-12 h-6 rounded-full relative transition-all duration-300 flex-shrink-0 ${settings.disclaimerEnabled ? 'bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30' : 'bg-stone-700'}`}
                                        >
                                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-lg ${settings.disclaimerEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Long Sentence Break Toggle */}
                                <div className="bg-stone-800/40 hover:bg-stone-800/60 transition-colors rounded-xl p-4 border border-white/5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-semibold text-stone-200">Long Sentence Break</span>
                                                <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full font-medium">Recommended</span>
                                            </div>
                                            <p className="text-xs text-stone-500">Generate 2 images for scenes with 20+ words</p>
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

                            <div className="space-y-5">
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
                                        <option value="reference_image">Reference Character</option>
                                    </select>
                                </div>

                                {settings.visualStyle === 'reference_image' && (
                                    <div className="space-y-2">
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

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Voice Persona</label>
                                    <select
                                        value={settings.audioVoice}
                                        onChange={(e) => setSettings({ ...settings, audioVoice: e.target.value })}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
                                    >
                                        {VOICE_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Visual Engine</label>
                                        <select
                                            value={settings.imageModel}
                                            onChange={(e) => setSettings({ ...settings, imageModel: e.target.value as any })}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
                                        >
                                            <option value="fal">Fal.ai (Flux Pro)</option>
                                            <option value="runware">Runware (Fast)</option>
                                            <option value="gemini">Google Gemini 2.5</option>
                                            <option value="imagen">Google Imagen 4.0 Fast</option>
                                            <option value="replicate">Replicate (FLUX LoRA)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Format</label>
                                        <select
                                            value={settings.aspectRatio}
                                            onChange={(e) => setSettings({ ...settings, aspectRatio: e.target.value as any })}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
                                        >
                                            <option value="16:9">Landscape</option>
                                            <option value="9:16">Portrait / Reel</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    onClick={handleStart}
                                    disabled={loading}
                                    className="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-900/40 transition-all flex items-center justify-center gap-2 group transform active:scale-[0.98]"
                                >
                                    {loading ? (
                                        <span className="animate-pulse">Initializing...</span>
                                    ) : (
                                        <><span>Begin Incantation</span> <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* BOTTOM: Recent Projects (Dashboard) */}
                <div className="border-t border-white/5 pt-12">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                            <Clock size={20} className="text-stone-500" /> Recent Visions
                        </h3>
                        <span className="text-xs text-stone-500 bg-stone-900 px-3 py-1 rounded-full border border-white/5">{projects.length} Total</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.length === 0 ? (
                            <div className="col-span-full text-center py-20 border border-dashed border-stone-800 rounded-xl text-stone-600 bg-stone-900/20">
                                <LayoutGrid size={48} className="mx-auto mb-4 opacity-20" />
                                <p className="text-lg">No visions recorded yet.</p>
                                <p className="text-sm opacity-50">Your creations will appear here.</p>
                            </div>
                        ) : (
                            projects.map(proj => (
                                <div
                                    key={proj.id}
                                    onClick={() => router.push(`/project/${proj.id}`)}
                                    className="group bg-stone-900/40 border border-white/5 hover:border-orange-500/30 hover:bg-stone-900/80 p-5 rounded-2xl cursor-pointer transition-all duration-300 relative overflow-hidden"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md border ${proj.status === 'done' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
                                            proj.status === 'generating' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
                                                'bg-stone-800 border-stone-700 text-stone-500'
                                            }`}>
                                            {proj.status}
                                        </span>
                                        <span className="text-xs text-stone-600 font-mono">
                                            {new Date(proj.created_at).toLocaleDateString()}
                                        </span>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (confirm('Delete this project?')) {
                                                    await deleteProject(proj.id);
                                                    const { data } = await supabase.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
                                                    if (data) setProjects(data);
                                                }
                                            }}
                                            className="p-1.5 hover:bg-red-500/20 hover:text-red-500 text-stone-600 rounded-lg transition-colors z-20 relative"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <p className="text-stone-300 font-medium line-clamp-3 text-sm leading-relaxed group-hover:text-white transition-colors">
                                        {proj.script.substring(0, 150) || "Untitled Vision"}...
                                    </p>

                                    <div className="absolute right-5 bottom-5 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 duration-300">
                                        <div className="w-10 h-10 rounded-full bg-orange-600 shadow-lg shadow-orange-900/50 flex items-center justify-center text-white">
                                            <Play size={16} fill="currentColor" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
