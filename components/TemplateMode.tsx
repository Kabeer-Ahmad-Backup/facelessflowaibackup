'use client';

import { useState } from 'react';
import { Film, ArrowRight } from 'lucide-react';
import AvatarTemplateFlow from './AvatarTemplateFlow';

export default function TemplateMode() {
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

    // If a template is selected, render its specific flow
    if (selectedTemplate === 'avatar_interleave') {
        return <AvatarTemplateFlow onBack={() => setSelectedTemplate(null)} />;
    }

    // Otherwise, show the Template Library grid
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-white font-serif mb-2">Template Library</h2>
                <p className="text-stone-400">Automated workflows starting from video uploads or structured formats.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Avatar Interleave Template Card */}
                <div
                    onClick={() => setSelectedTemplate('avatar_interleave')}
                    className="group flex flex-col justify-between bg-stone-900/40 border border-white/5 hover:border-orange-500/40 hover:bg-stone-900/80 rounded-2xl p-6 cursor-pointer transition-all duration-300 relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-orange-500/20 transition-all" />

                    <div>
                        <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 mb-6 group-hover:scale-110 transition-transform">
                            <Film size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Avatar Interleave</h3>
                        <p className="text-stone-400 text-sm leading-relaxed mb-6">
                            Upload a monologue video. The AI will extract your speech, detect sentences, and automatically generate B-roll images between segments while preserving your original voice.
                        </p>
                    </div>

                    <div className="flex items-center text-orange-400 text-sm font-semibold opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                        Use Template <ArrowRight size={16} className="ml-1" />
                    </div>
                </div>

                {/* Coming Soon Placeholders */}
                <div className="flex flex-col justify-center items-center bg-stone-900/20 border border-white/5 border-dashed rounded-2xl p-6 h-full min-h-[250px] opacity-50">
                    <p className="text-stone-500 font-mono text-sm uppercase tracking-widest">More Templates Soon</p>
                </div>
            </div>
        </div>
    );
}
