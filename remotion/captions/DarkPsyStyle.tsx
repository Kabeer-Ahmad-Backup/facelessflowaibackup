import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';
import { estimateWordTimings } from './utils';
import { random } from 'remotion';

interface DarkPsyStyleProps {
    text: string;
    durationInSeconds: number;
}

export const DarkPsyStyle: React.FC<DarkPsyStyleProps> = ({ text, durationInSeconds }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const currentTime = frame / fps;

    const timings = estimateWordTimings(text, durationInSeconds);

    // Group words into 1-2 word chunks for impact
    const chunks: { words: string[], startTime: number, endTime: number, index: number }[] = [];
    const wordsPerChunk = 2; // Aggressive pacing

    for (let i = 0; i < timings.length; i += wordsPerChunk) {
        const chunkTimings = timings.slice(i, i + wordsPerChunk);
        chunks.push({
            words: chunkTimings.map(t => t.word),
            startTime: chunkTimings[0].startTime,
            endTime: chunkTimings[chunkTimings.length - 1].endTime,
            index: Math.floor(i / wordsPerChunk)
        });
    }

    // Find current chunk
    const currentChunk = chunks.find(c =>
        currentTime >= c.startTime && currentTime < c.endTime
    );

    if (!currentChunk) return null;

    const chunkStartFrame = currentChunk.startTime * fps;
    const framesSinceStart = frame - chunkStartFrame;

    // Glitch / Shake Effect
    // Random noise based on current chunk index + frame
    const shakeX = random(currentChunk.index * 100 + frame) * 10 - 5;
    const shakeY = random(currentChunk.index * 200 + frame) * 10 - 5;

    // Slight chromatic aberration simulation (red shift)
    const glitchOffset = framesSinceStart < 5 ? 3 : 0;

    // Scale Up Animation (Creepy Zoom)
    const scale = interpolate(framesSinceStart, [0, 30], [1, 1.15], {
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        extrapolateRight: 'clamp'
    });

    // Opacity Fade In (Fast)
    const opacity = interpolate(framesSinceStart, [0, 3], [0, 1]);

    // Color Logic: Alternate between White and Red/Yellow for emphasis
    const isEmphasis = currentChunk.index % 3 === 0; // Every 3rd chunk is "special"
    const mainColor = isEmphasis ? '#FFD700' : '#FFFFFF'; // Gold or White
    const shadowColor = isEmphasis ? '#FF0000' : '#000000'; // Red shadow for emphasis

    return (
        <AbsoluteFill style={{
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'none',
            paddingBottom: 150 // Position near bottom-middle
        }}>
            <div style={{
                transform: `scale(${scale}) translate(${shakeX}px, ${shakeY}px)`,
                textAlign: 'center',
                position: 'relative'
            }}>
                {/* Background Box for Contrast */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '120%',
                    height: '140%',
                    background: 'black',
                    opacity: 0.7,
                    filter: 'blur(20px)',
                    zIndex: -1
                }} />

                {/* Glitch Shadow (Red Shift) */}
                <h1 style={{
                    fontFamily: 'Impact, "Arial Black", sans-serif',
                    fontSize: 82,
                    fontWeight: 900,
                    color: shadowColor,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    margin: 0,
                    lineHeight: 1,
                    position: 'absolute',
                    top: 0,
                    left: glitchOffset,
                    opacity: 0.7,
                    zIndex: 0
                }}>
                    {currentChunk.words.join(' ')}
                </h1>

                {/* Main Text */}
                <h1 style={{
                    fontFamily: 'Impact, "Arial Black", sans-serif',
                    fontSize: 82,
                    fontWeight: 900,
                    color: mainColor,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    margin: 0,
                    lineHeight: 1,
                    opacity: opacity,
                    zIndex: 1,
                    textShadow: '0 10px 30px rgba(0,0,0,1)'
                }}>
                    {currentChunk.words.join(' ')}
                </h1>

                {/* Film Scratch / Grain Overlay (Simulated with simple noise line) */}
                {isEmphasis && (
                    <div style={{
                        position: 'absolute',
                        top: random(frame) * 100 + '%',
                        left: 0,
                        width: '100%',
                        height: '2px',
                        background: 'rgba(255,255,255,0.3)',
                        opacity: random(frame + 10) > 0.8 ? 1 : 0
                    }} />
                )}
            </div>
        </AbsoluteFill>
    );
};
