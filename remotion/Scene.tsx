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
    const durationFrames = Math.ceil((scene.duration || 5) * fps);

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
                <AbsoluteFill style={{ transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)` }}>
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
            {settings.captions.enabled && (
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
                            // Animation-specific styles
                            ...(settings.captions.animation === 'fade-in' ? {
                                opacity: interpolate(frame, [0, durationFrames * 0.3], [0, 1], { extrapolateRight: 'clamp' })
                            } : {}),
                            ...(settings.captions.animation === 'slide-up' ? {
                                transform: `translateY(${interpolate(frame, [0, durationFrames * 0.3], [50, 0], { extrapolateRight: 'clamp' })}px)`,
                                opacity: interpolate(frame, [0, durationFrames * 0.3], [0, 1], { extrapolateRight: 'clamp' })
                            } : {}),
                            ...(settings.captions.animation === 'bounce' ? {
                                transform: `scale(${interpolate(
                                    frame,
                                    [0, durationFrames * 0.15, durationFrames * 0.3],
                                    [0.5, 1.1, 1],
                                    { extrapolateRight: 'clamp', easing: Easing.bounce }
                                )})`,
                                opacity: frame < durationFrames * 0.3 ? interpolate(frame, [0, durationFrames * 0.15], [0, 1], { extrapolateRight: 'clamp' }) : 1
                            } : {})
                        }}
                    >
                        {(() => {
                            const animation = settings.captions.animation || 'typewriter';

                            // Typewriter Effect
                            if (animation === 'typewriter') {
                                const chars = scene.text.length;
                                const progress = interpolate(frame, [0, durationFrames * 0.8], [0, chars]);
                                const visibleChars = Math.floor(progress);
                                return scene.text.slice(0, visibleChars);
                            }

                            // All other animations show full text
                            return scene.text;
                        })()}
                    </div>
                </AbsoluteFill>
            )}
        </AbsoluteFill>
    );
};
