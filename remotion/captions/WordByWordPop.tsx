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

    // Calculate current pair index (every 2 words is a pair)
    const currentPairIndex = Math.floor(currentIndex / 2);

    // Create pairs of words
    const pairs: { words: string[], indices: number[], startTime: number, pairIndex: number }[] = [];
    for (let i = 0; i < timings.length; i += 2) {
        const word1 = timings[i];
        const word2 = timings[i + 1];

        pairs.push({
            words: word2 ? [word1.word, word2.word] : [word1.word],
            indices: word2 ? [i, i + 1] : [i],
            startTime: word1.startTime,
            pairIndex: Math.floor(i / 2)
        });
    }

    // Show only 3 pairs (5-6 words total)
    const WINDOW_SIZE = 3;
    const startPairIndex = Math.max(0, currentPairIndex - 1);
    const endPairIndex = Math.min(pairs.length, startPairIndex + WINDOW_SIZE);
    const visiblePairs = pairs.slice(startPairIndex, endPairIndex);

    return (
        <AbsoluteFill style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 80,
            pointerEvents: 'none'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                maxWidth: '90%',
                padding: '0 20px',
                gap: 16
            }}>
                {visiblePairs.map((pair) => {
                    const isActive = pair.pairIndex === currentPairIndex;
                    const isPast = pair.pairIndex < currentPairIndex;
                    const isFuture = pair.pairIndex > currentPairIndex;

                    // Animation timing
                    const framesSinceActive = frame - (pair.startTime * fps);

                    // Spring animation for active pair
                    const scale = isActive ? spring({
                        frame: framesSinceActive,
                        fps,
                        config: { damping: 200, stiffness: 300, mass: 0.5 }
                    }) : 1;

                    // Pop scale effect
                    const activeScale = isActive
                        ? interpolate(scale, [0, 1], [0.9, 1.2], { easing: Easing.out(Easing.ease) })
                        : 1;

                    // Bounce effect
                    const yOffset = isActive
                        ? interpolate(framesSinceActive, [0, 8, 16], [0, -10, 0], {
                            extrapolateRight: 'clamp',
                            easing: Easing.bezier(0.25, 0.1, 0.25, 1)
                        })
                        : 0;

                    // Opacity
                    const opacity = isFuture ? 0.3 : 1;

                    return (
                        <div
                            key={pair.pairIndex}
                            style={{
                                display: 'inline-block',
                                position: 'relative',
                                transform: `scale(${activeScale}) translateY(${yOffset}px)`,
                                transition: !isActive ? 'transform 0.25s ease-out' : 'none',
                                opacity,
                                // Add extra margin for non-active pairs to create space
                                margin: isActive ? '0 20px' : '0'
                            }}
                        >
                            {/* Single gradient background for the entire pair */}
                            {isActive && (
                                <div style={{
                                    position: 'absolute',
                                    top: -8,
                                    left: -12,
                                    right: -12,
                                    bottom: -8,
                                    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                                    borderRadius: 12,
                                    zIndex: -1,
                                    boxShadow: '0 8px 24px rgba(255, 215, 0, 0.6), 0 0 30px rgba(255, 165, 0, 0.4)',
                                    opacity: interpolate(framesSinceActive, [0, 6], [0, 1], { extrapolateRight: 'clamp' })
                                }} />
                            )}

                            {/* Outer glow */}
                            {isActive && (
                                <div style={{
                                    position: 'absolute',
                                    top: -16,
                                    left: -16,
                                    right: -16,
                                    bottom: -16,
                                    background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)',
                                    borderRadius: 16,
                                    zIndex: -2,
                                    opacity: interpolate(framesSinceActive, [0, 8, 20], [0, 0.8, 0.3], { extrapolateRight: 'clamp' })
                                }} />
                            )}

                            {/* Both words together */}
                            <span style={{
                                fontFamily: 'Inter, Arial, sans-serif',
                                fontSize: isActive ? 64 : 50,
                                fontWeight: isActive ? 900 : 700,
                                color: isActive ? '#1A1A1A' : (isPast ? '#FFFFFF' : '#C0C0C0'),
                                textShadow: isActive
                                    ? 'none'
                                    : '3px 3px 6px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.7)',
                                letterSpacing: isActive ? '1.5px' : '0.5px',
                                textTransform: 'uppercase',
                                transition: !isActive ? 'all 0.25s ease' : 'none',
                                whiteSpace: 'nowrap'
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
