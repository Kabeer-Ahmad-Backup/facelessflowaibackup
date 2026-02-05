import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { estimateWordTimings, getCurrentWordIndex } from './utils';

interface KaraokeHighlightProps {
    text: string;
    durationInSeconds: number;
    color?: string; // Add optional color prop
}

export const KaraokeHighlight: React.FC<KaraokeHighlightProps> = ({
    text,
    durationInSeconds,
    color = '#00D9FF' // Default neon blue
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const timings = estimateWordTimings(text, durationInSeconds);
    const currentIndex = getCurrentWordIndex(timings, currentTime);

    // Group words into pairs
    const currentPairIndex = Math.floor(currentIndex / 2);

    // Create pairs array
    const pairs: { words: string[], startTime: number, endTime: number, pairIndex: number }[] = [];
    for (let i = 0; i < Math.ceil(timings.length / 2); i++) {
        const wordIndex1 = i * 2;
        const wordIndex2 = i * 2 + 1;
        const wordsInPair = [];

        if (wordIndex1 < timings.length) wordsInPair.push(timings[wordIndex1].word);
        if (wordIndex2 < timings.length) wordsInPair.push(timings[wordIndex2].word);

        if (wordsInPair.length > 0) {
            pairs.push({
                words: wordsInPair,
                startTime: timings[wordIndex1].startTime,
                endTime: timings[Math.min(wordIndex2, timings.length - 1)].endTime,
                pairIndex: i
            });
        }
    }

    // Show only 3 pairs at a time (5-6 words total) - sliding window
    const WINDOW_SIZE = 3;
    const startPairIndex = Math.max(0, currentPairIndex - 1);
    const endPairIndex = Math.min(pairs.length, startPairIndex + WINDOW_SIZE);
    const visiblePairs = pairs.slice(startPairIndex, endPairIndex);

    // Convert hex color to RGB for glow effects
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 217, b: 255 };
    };

    const rgb = hexToRgb(color);

    return (
        <AbsoluteFill style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 100,
            pointerEvents: 'none'
        }}>
            <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                padding: '28px 48px',
                borderRadius: 20,
                maxWidth: '90%',
                backdropFilter: 'blur(20px)',
                border: `2px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`,
                boxShadow: `0 12px 48px rgba(0, 0, 0, 0.8), 0 0 80px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 16,
                    lineHeight: 1.7
                }}>
                    {visiblePairs.map((pair) => {
                        const isActive = pair.pairIndex === currentPairIndex;
                        const isPast = pair.pairIndex < currentPairIndex;
                        const isFuture = pair.pairIndex > currentPairIndex;

                        const framesSinceActive = frame - (pair.startTime * fps);

                        // Smooth spring animation
                        const scaleProgress = isActive ? spring({
                            frame: framesSinceActive,
                            fps,
                            config: { damping: 220, stiffness: 280, mass: 0.6 }
                        }) : 0;

                        // Enhanced scale effect
                        const scale = isActive ? interpolate(scaleProgress, [0, 1], [1, 1.2]) : 1;

                        // Dynamic glow animation
                        const glowIntensity = isActive
                            ? interpolate(framesSinceActive, [0, 6, 12, 20], [0, 1, 0.8, 0.6], {
                                extrapolateRight: 'clamp',
                                easing: Easing.bezier(0.4, 0, 0.2, 1)
                            })
                            : 0;

                        // Color system
                        const activeColor = color;
                        const textColor = isActive
                            ? activeColor
                            : isPast
                                ? '#FFFFFF'
                                : '#666666';

                        // Enhanced neon glow effect
                        const textShadow = isActive
                            ? `
                                0 0 ${glowIntensity * 40}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${glowIntensity}),
                                0 0 ${glowIntensity * 60}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${glowIntensity * 0.7}),
                                0 0 ${glowIntensity * 90}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${glowIntensity * 0.4}),
                                0 4px 12px rgba(0,0,0,0.9)
                            `
                            : '3px 3px 8px rgba(0,0,0,0.9)';

                        // Subtle brightness pulse
                        const brightness = isActive ? 1 + (glowIntensity * 0.3) : 1;

                        // Opacity for future words
                        const opacity = isFuture ? 0.4 : 1;

                        return (
                            <span
                                key={pair.pairIndex}
                                style={{
                                    fontFamily: 'Inter, Arial, sans-serif',
                                    fontSize: 56,
                                    fontWeight: isActive ? 900 : 600,
                                    color: textColor,
                                    transform: `scale(${scale})`,
                                    display: 'inline-block',
                                    transition: !isActive ? 'color 0.3s ease, transform 0.3s ease, margin 0.3s ease' : 'margin 0.3s ease',
                                    textShadow,
                                    letterSpacing: isActive ? '2px' : '0.8px',
                                    position: 'relative',
                                    filter: `brightness(${brightness})`,
                                    textTransform: 'uppercase',
                                    whiteSpace: 'nowrap',
                                    opacity,
                                    // Add extra margin to push other words away when active
                                    // Increased margin significantly to prevent overlap
                                    margin: isActive ? '0 50px' : '0',
                                    // Higher z-index for active words  
                                    zIndex: isActive ? 10 : 1
                                }}
                            >
                                {pair.words.join(' ')}
                            </span>
                        );
                    })}
                </div>
            </div>
        </AbsoluteFill>
    );
};
