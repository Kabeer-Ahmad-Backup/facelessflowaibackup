import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { estimateWordTimings, getCurrentWordIndex } from './utils';

interface KaraokeHighlightProps {
    text: string;
    durationInSeconds: number;
}

export const KaraokeHighlight: React.FC<KaraokeHighlightProps> = ({ text, durationInSeconds }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const timings = estimateWordTimings(text, durationInSeconds);
    const currentIndex = getCurrentWordIndex(timings, currentTime);

    // Group words into pairs for smoother presentation
    const pairIndex = Math.floor(currentIndex / 2);

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

    return (
        <AbsoluteFill style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 100,
            pointerEvents: 'none'
        }}>
            <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                padding: '24px 40px',
                borderRadius: 18,
                maxWidth: '88%',
                backdropFilter: 'blur(15px)',
                border: '2px solid rgba(0, 217, 255, 0.3)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8), 0 0 60px rgba(0, 217, 255, 0.15)'
            }}>
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 18,
                    lineHeight: 1.6
                }}>
                    {pairs.map((pair) => {
                        const isActive = pair.pairIndex === pairIndex;
                        const isPast = pair.pairIndex < pairIndex;

                        const framesSinceActive = frame - (pair.startTime * fps);

                        // Reduced bounce - gentler spring animation
                        const scaleProgress = isActive ? spring({
                            frame: framesSinceActive,
                            fps,
                            config: { damping: 240, stiffness: 260 }
                        }) : 0;

                        // Reduced scale from 1.3 to 1.15
                        const scale = isActive ? interpolate(scaleProgress, [0, 1], [1, 1.15]) : 1;

                        // Neon blue glow animation - pulsing effect
                        const glowIntensity = isActive
                            ? interpolate(framesSinceActive, [0, 8, 16], [0, 1, 0.7], {
                                extrapolateRight: 'clamp',
                                easing: Easing.bezier(0.4, 0, 0.2, 1)
                            })
                            : 0;

                        // Enhanced neon blue for active pair
                        const color = isActive
                            ? '#00D9FF' // Bright neon blue
                            : isPast
                                ? '#FFFFFF' // White for past
                                : '#555555'; // Gray for future

                        // Text shadow for neon effect
                        const textShadow = isActive
                            ? `
                                0 0 ${glowIntensity * 30}px rgba(0, 217, 255, ${glowIntensity}),
                                0 0 ${glowIntensity * 50}px rgba(0, 217, 255, ${glowIntensity * 0.6}),
                                0 0 ${glowIntensity * 70}px rgba(0, 217, 255, ${glowIntensity * 0.3}),
                                3px 3px 8px rgba(0,0,0,0.9)
                            `
                            : '3px 3px 6px rgba(0,0,0,0.9)';

                        return (
                            <span
                                key={pair.pairIndex}
                                style={{
                                    fontFamily: 'Inter, Arial, sans-serif',
                                    fontSize: 52,
                                    fontWeight: isActive ? 900 : 600,
                                    color,
                                    transform: `scale(${scale})`,
                                    display: 'inline-block',
                                    transition: !isActive ? 'color 0.25s ease, transform 0.25s ease' : 'none',
                                    textShadow,
                                    letterSpacing: isActive ? '1.5px' : '0.5px',
                                    position: 'relative',
                                    filter: isActive ? `brightness(${1 + glowIntensity * 0.3})` : 'none'
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
