import { AbsoluteFill, Sequence, Series, Audio, Video, staticFile } from 'remotion';
import { z } from 'zod';
import { Scene } from './Scene';
import { ProjectSettings, SceneApi } from '../types';
import cameraFlashSound from '../public/camera_flash.mp3';
import swooshSound from '../public/swoosh.mp3';

export const MainCompositionSchema = z.object({
    scenes: z.array(z.any()), // refined type below
    settings: z.any(),
    isPart: z.boolean().optional(),
    partIndex: z.number().optional(),
});

type Props = {
    scenes: SceneApi[];
    settings: ProjectSettings;
    isPart?: boolean;
    partIndex?: number;
}

export const MainComposition: React.FC<Props> = ({ scenes, settings, isPart, partIndex }) => {
    if (!scenes || scenes.length === 0) {
        return (
            <AbsoluteFill className="bg-black flex items-center justify-center">
                <h1 className="text-white text-4xl">Waiting for scenes...</h1>
            </AbsoluteFill>
        )
    }

    return (
        <AbsoluteFill className="bg-black">
            <Series>
                {settings.disclaimerEnabled && (!isPart || partIndex === 0) && (
                    <Series.Sequence durationInFrames={45}> {/* 1.5s duration */}
                        <AbsoluteFill className="bg-black flex items-center justify-center">
                            {/* Use staticFile for safe resolution of public assets in Remotion */}
                            <Video src={staticFile("Disclaimer.mp4")} />
                        </AbsoluteFill>
                    </Series.Sequence>
                )}
                {scenes.map((scene, index) => {
                    let durationInSeconds = scene.duration || 5;

                    // Add buffer to last scene to ensure audio completes
                    // Audio files from Minimax may be 1-2s longer than reported duration
                    const isLastScene = index === scenes.length - 1;
                    if (isLastScene) {
                        durationInSeconds += 2.0; // Add 2.5s buffer for audio completion
                    }

                    const durationInFrames = Math.ceil(durationInSeconds * 30);

                    // Determine if we should play a transition sound at the END of this scene
                    // Logic: Play for all scenes EXCEPT the last one (index < scenes.length - 1)
                    const shouldPlaySound = index < scenes.length - 1 &&
                        settings.transitions.transitionSound &&
                        settings.transitions.transitionSound !== 'none';

                    const soundFile = settings.transitions.transitionSound === 'camera_flash'
                        ? cameraFlashSound
                        : swooshSound;

                    // Start sound 15 frames before the end (approx 0.5s)
                    const soundStartFrame = Math.max(0, durationInFrames - 15);

                    return (
                        <Series.Sequence key={scene.id} durationInFrames={durationInFrames}>
                            <Scene scene={scene} settings={settings} />
                            {shouldPlaySound && (
                                <Sequence from={soundStartFrame}>
                                    <Audio src={soundFile} />
                                </Sequence>
                            )}
                        </Series.Sequence>
                    )
                })}
            </Series>
        </AbsoluteFill>
    );
};
