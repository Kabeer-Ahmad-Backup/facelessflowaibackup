import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill } from 'remotion';
import type { ProjectSettings } from '../../types';

interface ClassicCaptionsProps {
    text: string;
    durationInSeconds: number;
    settings: ProjectSettings;
}

// Helper to chunk words into groups that fit 2 lines (~10-12 words per chunk)
const chunkWords = (text: string, wordsPerChunk: number = 12): string[] => {
    const words = text.trim().split(/\s+/);
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    
    return chunks;
};

export const ClassicCaptions: React.FC<ClassicCaptionsProps> = ({ text, durationInSeconds, settings }) => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();
    const durationFrames = durationInSeconds * fps;

    // Split text into chunks (each chunk = max 2 lines)
    const chunks = chunkWords(text);
    const framesPerChunk = Math.floor(durationFrames / chunks.length);

    // Find current chunk index
    const currentChunkIndex = Math.min(Math.floor(frame / framesPerChunk), chunks.length - 1);
    const currentChunk = chunks[currentChunkIndex];

    // Calculate transition progress for smooth fade
    const chunkStartFrame = currentChunkIndex * framesPerChunk;
    const chunkEndFrame = chunkStartFrame + framesPerChunk;
    const fadeInDuration = Math.min(10, framesPerChunk * 0.15); // 15% of chunk or 10 frames
    const fadeOutDuration = Math.min(10, framesPerChunk * 0.15);

    // Opacity for transitions
    let opacity = 1;
    if (frame < chunkStartFrame + fadeInDuration) {
        opacity = interpolate(frame, [chunkStartFrame, chunkStartFrame + fadeInDuration], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
        });
    } else if (frame > chunkEndFrame - fadeOutDuration && currentChunkIndex < chunks.length - 1) {
        opacity = interpolate(frame, [chunkEndFrame - fadeOutDuration, chunkEndFrame], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
        });
    }

    return (
        <AbsoluteFill
            className={`flex items-center pointer-events-none px-8
                ${settings.captions.position === 'top' ? 'justify-start pt-16' :
                    settings.captions.position === 'center' ? 'justify-center' :
                        settings.captions.position === 'mid-bottom' ? 'justify-end pb-32' :
                            'justify-end pb-16'} // bottom is default
            `}
            style={{ flexDirection: 'column' }}
        >
            <div
                className={`
                    text-white text-center max-w-[85%] leading-tight
                    ${settings.captions.font === 'serif' ? 'font-serif' : 'font-sans'}
                `}
                style={{
                    // Dynamic font size based on orientation, screen size, and user preference
                    fontSize: (() => {
                        const sizeMap = {
                            small: height > width ? (width < 500 ? 24 : 36) : (width < 1000 ? 32 : 48),
                            medium: height > width ? (width < 500 ? 32 : 48) : (width < 1000 ? 42 : 64),
                            large: height > width ? (width < 500 ? 40 : 60) : (width < 1000 ? 52 : 80),
                            xlarge: height > width ? (width < 500 ? 48 : 72) : (width < 1000 ? 64 : 96)
                        };
                        return sizeMap[settings.captions.fontSize || 'medium'];
                    })(),
                    fontFamily: settings.captions.font === 'brush' ? '"Permanent Marker", cursive' : undefined,
                    fontWeight: settings.captions.strokeWidth === 'bold' ? 'bold' : 'normal',
                    textShadow: (() => {
                        const strokeMap = {
                            thin: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                            medium: '3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
                            thick: '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000',
                            bold: '5px 5px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 10px #000'
                        };
                        return strokeMap[settings.captions.strokeWidth || 'medium'];
                    })(),
                    opacity,
                    // Max 2 lines with ellipsis overflow (backup)
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                    overflow: 'hidden',
                    lineHeight: 1.3,
                    // Animation-specific styles
                    ...(settings.captions.animation === 'fade-in' ? {
                        opacity: opacity * interpolate(frame - chunkStartFrame, [0, fadeInDuration], [0, 1], { extrapolateRight: 'clamp' })
                    } : {}),
                    ...(settings.captions.animation === 'slide-up' ? {
                        transform: `translateY(${interpolate(frame - chunkStartFrame, [0, fadeInDuration], [50, 0], { extrapolateRight: 'clamp' })}px)`,
                    } : {}),
                    ...(settings.captions.animation === 'bounce' ? {
                        transform: `scale(${interpolate(
                            frame - chunkStartFrame,
                            [0, fadeInDuration * 0.5, fadeInDuration],
                            [0.5, 1.1, 1],
                            { extrapolateRight: 'clamp', easing: Easing.bounce }
                        )})`,
                    } : {})
                }}
            >
                {(() => {
                    const animation = settings.captions.animation || 'typewriter';

                    // Typewriter Effect (only for current chunk)
                    if (animation === 'typewriter') {
                        const chars = currentChunk.length;
                        const typewriterDuration = framesPerChunk * 0.7;
                        const progress = interpolate(frame - chunkStartFrame, [0, typewriterDuration], [0, chars], {
                            extrapolateRight: 'clamp'
                        });
                        const visibleChars = Math.floor(Math.max(0, progress));
                        return currentChunk.slice(0, visibleChars);
                    }

                    // All other animations show full chunk
                    return currentChunk;
                })()}
            </div>
        </AbsoluteFill>
    );
};
