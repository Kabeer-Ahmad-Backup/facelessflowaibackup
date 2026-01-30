import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { estimateWordTimings } from './utils';

interface MrBeastStyleProps {
    text: string;
    durationInSeconds: number;
}

export const MrBeastStyle: React.FC<MrBeastStyleProps> = ({ text, durationInSeconds }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const timings = estimateWordTimings(text, durationInSeconds);

    // Group words into 3 word chunks for better readability
    const chunks: { words: string[], startTime: number, endTime: number }[] = [];
    const wordsPerChunk = 3;

    for (let i = 0; i < timings.length; i += wordsPerChunk) {
        const chunkTimings = timings.slice(i, i + wordsPerChunk);
        chunks.push({
            words: chunkTimings.map(t => t.word),
            startTime: chunkTimings[0].startTime,
            endTime: chunkTimings[chunkTimings.length - 1].endTime
        });
    }

    // Find current chunk
    const currentChunk = chunks.find(c =>
        currentTime >= c.startTime && currentTime < c.endTime
    );

    if (!currentChunk) return null;

    const chunkStartFrame = currentChunk.startTime * fps;
    const framesSinceStart = frame - chunkStartFrame;

    // Explosive entrance bounce
    const bounceScale = spring({
        frame: framesSinceStart,
        fps,
        config: { damping: 80, stiffness: 300, mass: 0.8 }
    });

    const scale = interpolate(bounceScale, [0, 1], [0.6, 1.0], {
        easing: Easing.out(Easing.back(1.7))
    });

    // Shake effect on entrance
    const shake = framesSinceStart < 15
        ? interpolate(framesSinceStart, [0, 5, 10, 15], [0, -3, 3, 0], {
            easing: Easing.bezier(0.4, 0, 0.6, 1)
        })
        : 0;

    // Pulsing glow effect
    const glowPulse = Math.sin(frame / 10) * 0.3 + 0.7;

    // Rotation removed - looked too chaotic
    const rotation = 0;

    return (
        <AbsoluteFill style={{
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none'
        }}>
            <div style={{
                transform: `scale(${scale}) rotate(${rotation}deg) translateX(${shake}px)`,
                textAlign: 'center',
                padding: '0 40px'
            }}>
                {/* Outer glow layers */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    filter: `blur(${glowPulse * 30}px)`,
                    opacity: glowPulse * 0.6,
                    zIndex: -1
                }}>
                    <h1 style={{
                        fontFamily: 'Inter, Arial Black, sans-serif',
                        fontSize: 76,
                        fontWeight: 900,
                        color: '#FFD700',
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        margin: 0,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap'
                    }}>
                        {currentChunk.words.join(' ')}
                    </h1>
                </div>

                {/* Main text with neon effect */}
                <h1 style={{
                    fontFamily: 'Inter, Arial Black, sans-serif',
                    fontSize: 76,
                    fontWeight: 900,
                    color: '#FFFFFF',
                    textTransform: 'uppercase',
                    letterSpacing: '2px',
                    margin: 0,
                    lineHeight: 1.2,
                    textShadow: `
                        -5px -5px 0 #000,
                        5px -5px 0 #000,
                        -5px 5px 0 #000,
                        5px 5px 0 #000,
                        0 0 20px rgba(255,255,255,${glowPulse}),
                        0 0 40px rgba(255,215,0,${glowPulse * 0.8}),
                        0 0 60px rgba(255,165,0,${glowPulse * 0.6})
                    `,
                    WebkitTextStroke: '4px black',
                    paintOrder: 'stroke fill',
                    filter: `drop-shadow(0 6px 12px rgba(0,0,0,0.7))`,
                    position: 'relative',
                    zIndex: 1
                }}>
                    {currentChunk.words.join(' ')}
                </h1>

                {/* Bottom accent line */}
                <div style={{
                    marginTop: 12,
                    height: 6,
                    background: 'linear-gradient(90deg, transparent, #FFD700, transparent)',
                    borderRadius: 3,
                    boxShadow: `0 0 ${glowPulse * 20}px rgba(255, 215, 0, ${glowPulse})`,
                    transform: `scaleX(${interpolate(framesSinceStart, [0, 15], [0, 1], { extrapolateRight: 'clamp' })})`
                }} />
            </div>
        </AbsoluteFill>
    );
};
