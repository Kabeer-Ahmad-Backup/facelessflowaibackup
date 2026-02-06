import { AbsoluteFill, Img, Video, useCurrentFrame, useVideoConfig, interpolate, Easing, Audio } from 'remotion';
import { SceneApi, ProjectSettings } from '../types';
import { AudioWave } from './AudioWave';

type Props = {
    scene: SceneApi;
    settings: ProjectSettings;
};

export const Scene: React.FC<Props> = ({ scene, settings }) => {
    const frame = useCurrentFrame();
    const { fps, width, height } = useVideoConfig();

    let d = scene.duration || 5;
    if (d > 300) { d = d / 1000; }

    const durationFrames = Math.ceil(d * fps);

    // Transition duration (in frames) - 0.3 seconds
    const transitionDuration = fps * 0.3;

    // Calculate transition opacity/effects
    const getTransitionStyle = () => {
        if (frame >= transitionDuration) return {};

        const progress = frame / transitionDuration;

        switch (settings.transitions.type) {
            case 'fadein':
                return { opacity: interpolate(frame, [0, transitionDuration], [0, 1]) };

            case 'crossfade':
                return { opacity: interpolate(frame, [0, transitionDuration], [0, 1]) };

            case 'white_flash':
                const whiteFlash = interpolate(frame, [0, transitionDuration * 0.5, transitionDuration], [1, 0, 0], { extrapolateRight: 'clamp' });
                return {
                    opacity: 1,
                    filter: `brightness(${1 + whiteFlash * 3})`
                };

            case 'camera_flash':
                const cameraBright = interpolate(frame, [0, transitionDuration * 0.3, transitionDuration], [2, 1, 1], { extrapolateRight: 'clamp' });
                return {
                    filter: `brightness(${cameraBright}) contrast(${interpolate(frame, [0, transitionDuration], [1.5, 1])})`
                };

            case 'none':
            default:
                return {};
        }
    };

    // Camera Movement Logic
    const movements = settings.cameraMovements || ['zoom_in'];
    const movementType = movements[scene.order_index % movements.length];

    let scale = 1;
    let translateX = 0;
    let translateY = 0;

    switch (movementType) {
        case 'zoom_in':
            scale = interpolate(frame, [0, durationFrames], [1, 1.15], { easing: Easing.bezier(0.25, 1, 0.5, 1) });
            break;
        case 'zoom_out':
            scale = interpolate(frame, [0, durationFrames], [1.15, 1], { easing: Easing.bezier(0.25, 1, 0.5, 1) });
            break;
        case 'pan_left':
            scale = 1.15;
            translateX = interpolate(frame, [0, durationFrames], [0, -40]);
            break;
        case 'pan_right':
            scale = 1.15;
            translateX = interpolate(frame, [0, durationFrames], [-40, 0]);
            break;
        case 'pan_up':
            scale = 1.15;
            translateY = interpolate(frame, [0, durationFrames], [0, -40]);
            break;
        case 'pan_down':
            scale = 1.15;
            translateY = interpolate(frame, [0, durationFrames], [-40, 0]);
            break;
        case 'static':
        default:
            scale = 1;
            break;
    }

    return (
        <AbsoluteFill style={{ overflow: 'hidden', ...getTransitionStyle() }}>
            {/* Background Image with Ken Burns */}
            {scene.image_url ? (
                <>
                    {/* First Image */}
                    <AbsoluteFill style={{
                        transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
                        opacity: scene.image_url_2 ? interpolate(
                            frame,
                            [0, durationFrames * 0.45, durationFrames * 0.55],
                            [1, 1, 0],
                            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                        ) : 1
                    }}>
                        {(scene.media_type === 'video' || scene.image_url.includes('.mp4')) ? (
                            <Video
                                src={scene.image_url}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                muted={true}
                                loop
                            />
                        ) : (
                            <Img
                                src={scene.image_url}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        )}
                    </AbsoluteFill>

                    {/* Second Image (if exists) - for Long Sentence Break */}
                    {scene.image_url_2 && (
                        <AbsoluteFill style={{
                            transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
                            opacity: interpolate(
                                frame,
                                [0, durationFrames * 0.45, durationFrames * 0.55],
                                [0, 0, 1],
                                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                            )
                        }}>
                            <Img
                                src={scene.image_url_2}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </AbsoluteFill>
                    )}
                </>
            ) : (
                <AbsoluteFill className="bg-gray-900 flex items-center justify-center">
                    <span className="text-white">Generating Image...</span>
                </AbsoluteFill>
            )}

            {/* Audio */}
            {scene.audio_url && (
                <Audio
                    src={scene.audio_url}
                    volume={1}
                    startFrom={0}
                />
            )}

            {/* Audio Wave Visualization */}
            {settings.audioWave?.enabled && scene.audio_url && (
                <AudioWave
                    audioUrl={scene.audio_url}
                    style={settings.audioWave.style}
                    position={settings.audioWave.position}
                    color={settings.audioWave.color}
                />
            )}

            {/* Captions */}
            {settings.captions.enabled && (() => {
                const captionStyle = settings.captions.style || 'classic';

                // Import statements are at the top, so we check style here
                if (captionStyle === 'word_pop') {
                    const { WordByWordPop } = require('./captions/WordByWordPop');
                    return <WordByWordPop text={scene.text} durationInSeconds={d} />;
                } else if (captionStyle === 'karaoke') {
                    const { KaraokeHighlight } = require('./captions/KaraokeHighlight');
                    return <KaraokeHighlight text={scene.text} durationInSeconds={d} color={settings.captions.color} />;
                } else if (captionStyle === 'mrbeast') {
                    const { MrBeastStyle } = require('./captions/MrBeastStyle');
                    return <MrBeastStyle text={scene.text} durationInSeconds={d} />;
                } else {
                    // Classic caption rendering with 2-line limit
                    const { ClassicCaptions } = require('./captions/ClassicCaptions');
                    return <ClassicCaptions text={scene.text} durationInSeconds={d} settings={settings} />;
                }
            })()}
        </AbsoluteFill>
    );
};
