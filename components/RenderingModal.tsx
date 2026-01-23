import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, AlertCircle, Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RenderingModalProps {
    isOpen: boolean;
    onClose: () => void;
    status: 'idle' | 'rendering' | 'done' | 'error';
    progress: number; // 0 to 1
    details?: {
        framesRendered: number;
        totalFrames?: number;
        costs?: number;
        lambdasInvoked?: number;
    };
    videoUrl?: string | null;
    error?: string | null;
}

export default function RenderingModal({
    isOpen,
    onClose,
    status,
    progress,
    details,
    videoUrl,
    error
}: RenderingModalProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-stone-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden"
                >
                    {/* Background Glow */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-600 via-purple-600 to-blue-600 opacity-50" />

                    {/* Close Button (only if done or error) */}
                    {(status === 'done' || status === 'error') && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-stone-500 hover:text-stone-300 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}

                    <div className="flex flex-col items-center text-center space-y-6 pt-4">

                        {/* Status Icon */}
                        <div className="relative">
                            {status === 'rendering' && (
                                <div className="relative">
                                    <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full" />
                                    <Loader2 size={48} className="text-orange-500 animate-spin relative z-10" />
                                </div>
                            )}
                            {status === 'done' && (
                                <div className="relative">
                                    <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full" />
                                    <CheckCircle size={48} className="text-green-500 relative z-10" />
                                </div>
                            )}
                            {status === 'error' && (
                                <div className="relative">
                                    <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full" />
                                    <AlertCircle size={48} className="text-red-500 relative z-10" />
                                </div>
                            )}
                        </div>

                        {/* Text Status */}
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">
                                {status === 'rendering' ? 'Weaving your Vision...' :
                                    status === 'done' ? 'Masterpiece Created!' :
                                        status === 'error' ? 'Rendering Failed' :
                                            'Initializing Ritual...'}
                            </h2>
                            <p className="text-stone-400 text-sm">
                                {status === 'rendering' ? 'Your video is being rendered on the cloud using distributed AWS Lambdas.' :
                                    status === 'done' ? 'Your video is ready for the world.' :
                                        status === 'error' ? (error || 'Something went wrong during the ritual.') :
                                            'Preparing the cloud infrastructure...'}
                            </p>
                        </div>

                        {/* Progress Bar */}
                        {(status === 'rendering' || status === 'done') && (
                            <div className="w-full space-y-2">
                                <div className="h-2 w-full bg-stone-800 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-orange-500 to-purple-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.max(5, progress * 100)}%` }}
                                        transition={{ type: 'spring', damping: 20 }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-stone-500 font-mono">
                                    <span>{Math.round(progress * 100)}%</span>
                                    {details?.framesRendered && (
                                        <span>{details.framesRendered} Frames</span>
                                    )}
                                </div>
                                {details?.lambdasInvoked && (
                                    <div className="text-[10px] text-stone-600">
                                        ⚡ {details.lambdasInvoked} Lambdas Active
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="w-full pt-2">
                            {status === 'done' && videoUrl ? (
                                <a
                                    href={videoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full bg-white hover:bg-stone-200 text-black font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                                >
                                    <Download size={18} />
                                    Download Video
                                </a>
                            ) : status === 'rendering' ? (
                                <button disabled className="w-full bg-stone-800 text-stone-500 font-medium py-3 rounded-xl cursor-not-allowed opacity-50">
                                    Rendering...
                                </button>
                            ) : status === 'error' ? (
                                <button onClick={onClose} className="w-full bg-stone-800 hover:bg-stone-700 text-white font-medium py-3 rounded-xl transition-colors">
                                    Close
                                </button>
                            ) : null}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
