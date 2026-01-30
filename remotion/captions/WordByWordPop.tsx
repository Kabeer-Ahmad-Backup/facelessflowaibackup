import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
import { estimateWordTimings, getCurrentWordIndex } from './utils';

interface WordByWordPopProps {
    text: string;
    durationInSeconds: number;
}

export const WordByWordPop: React.FC<WordByWordPopProps> = ({ text, durationInSeconds }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const timings = estimateWordTimings(text, durationInSeconds);
    const currentIndex = getCurrentWordIndex(timings, currentTime);

    // Group words into pairs
    const pairIndex = Math.floor(currentIndex / 2);

    // Show only a window of pairs to avoid clutter
    const PAIRS_BEFORE = 1;
    const PAIRS_AFTER = 1;
    const startPairIndex = Math.max(0, pairIndex - PAIRS_BEFORE);
    const endPairIndex = Math.min(Math.ceil(timings.length / 2), pairIndex + PAIRS_AFTER + 1);

    // Create pairs array
    const pairs: { words: string[], startTime: number, endTime: number, pairIndex: number }[] = [];
    for (let i = startPairIndex; i < endPairIndex; i++) {
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
            paddingBottom: 80,
            pointerEvents: 'none'
        }}>
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 16,
                maxWidth: '90%',
                padding: '0 20px'
            }}>
                {pairs.map((pair) => {
                    const isActive = pair.pairIndex === pairIndex;
                    const isPast = pair.pairIndex < pairIndex;
                    const isFuture = pair.pairIndex > pairIndex;

                    // Smooth spring animation for active pair
                    const framesSinceActive = frame - (pair.startTime * fps);
                    const scale = isActive ? spring({
                        frame: framesSinceActive,
                        fps,
                        config: { damping: 250, stiffness: 300, mass: 0.6 }
                    }) : 1;

                    // Gentle pop effect
                    const activeScale = isActive
                        ? interpolate(scale, [0, 1], [0.85, 1.15], { easing: Easing.out(Easing.ease) })
                        : isPast ? 1 : 0.95;

                    // Opacity animations
                    const opacity = isFuture ? 0.4 : 1;

                    // Gentler Y-position bounce
                    const yOffset = isActive
                        ? interpolate(framesSinceActive, [0, 10, 20], [0, -8, 0], {
                            extrapolateRight: 'clamp',
                            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
                        })
                        : 0;

                    return (
                        <div
                            key={pair.pairIndex}
                            style={{
                                display: 'inline-block',
                                position: 'relative',
                                transform: `scale(${activeScale}) translateY(${yOffset}px)`,
                                transition: !isActive ? 'transform 0.3s ease-out, opacity 0.3s' : 'none',
                                opacity
                            }}
                        >
                            {/* Single animated gradient background for entire pair */}
                            {isActive && (
                                <div style={{
                                    position: 'absolute',
                                    top: -8,
                                    left: -10,
                                    right: -10,
                                    bottom: -8,
                                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                                    borderRadius: 10,
                                    zIndex: -1,
                                    boxShadow: '0 6px 20px rgba(255, 215, 0, 0.5), 0 0 25px rgba(255, 165, 0, 0.3)',
                                    opacity: interpolate(framesSinceActive, [0, 8], [0, 1], { extrapolateRight: 'clamp' })
                                }} />
                            )}

                            {/* Softer glow effect for active pair */}
                            {isActive && (
                                <div style={{
                                    position: 'absolute',
                                    top: -12,
                                    left: -12,
                                    right: -12,
                                    bottom: -12,
                                    background: 'radial-gradient(circle, rgba(255,215,0,0.25) 0%, transparent 70%)',
                                    borderRadius: 14,
                                    zIndex: -2,
                                    opacity: interpolate(framesSinceActive, [0, 10, 25], [0, 0.7, 0.2], { extrapolateRight: 'clamp' })
                                }} />
                            )}

                            {/* Both words together */}
                            <span style={{
                                fontFamily: 'Inter, Arial, sans-serif',
                                fontSize: isActive ? 60 : 52,
                                fontWeight: isActive ? 900 : 700,
                                color: isActive ? '#1A1A1A' : (isPast ? '#FFFFFF' : '#B0B0B0'),
                                textShadow: isActive
                                    ? 'none'
                                    : '3px 3px 6px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.7)',
                                letterSpacing: isActive ? '1px' : '0.5px',
                                textTransform: 'uppercase',
                                transition: !isActive ? 'all 0.3s ease' : 'none'
                            }}>
                                {pair.words.join(' ')}
                            </span>
                        </div>
                    );
                })}
            </div>
        </AbsoluteFill>
    );
};
