import { Composition } from 'remotion';
import { MainComposition, MainCompositionSchema } from './MainComposition';
import { loadFont } from '@remotion/google-fonts/PermanentMarker';
import './style.css';

loadFont();

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="MirzaMain"
                component={MainComposition}
                durationInFrames={300} // Default placeholder, dynamic later
                fps={30}
                width={1920}
                height={1080}
                schema={MainCompositionSchema}
                defaultProps={{
                    scenes: [],
                    settings: {
                        aspectRatio: '16:9',
                        visualStyle: 'zen',
                        imageModel: 'fal',
                        audioVoice: 'English_ManWithDeepVoice',
                        disclaimerEnabled: false,
                        captions: {
                            enabled: true,
                            position: 'bottom',
                            font: 'helvetica',
                            fontSize: 'medium',
                            animation: 'typewriter',
                            strokeWidth: 'medium'
                        },
                        transitions: { mode: 'random', type: 'fadein' },
                        audioWave: {
                            enabled: false,
                            position: 'bottom',
                            style: 'bars',
                            color: '#ffffff'
                        }
                    }
                }}
                calculateMetadata={({ props }) => {
                    // Calculate total duration based on individual scene frames to prevent rounding errors
                    const totalFrames = props.scenes.reduce((acc, scene) => {
                        return acc + Math.ceil((scene.duration || 5) * 30);
                    }, 0);

                    // Calculate dimensions based on aspect ratio
                    const isPortrait = props.settings.aspectRatio === '9:16';
                    const width = isPortrait ? 1080 : 1920;
                    const height = isPortrait ? 1920 : 1080;

                    return {
                        durationInFrames: totalFrames || 150, // Default to 150 if 0
                        width,
                        height,
                    };
                }}
            />
        </>
    );
};
