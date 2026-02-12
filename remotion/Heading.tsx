import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from 'remotion';

type Props = {
    text: string;
};

export const Heading: React.FC<Props> = ({ text }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Smooth slide in from center with scale
    const scale = spring({
        frame,
        fps,
        from: 0.8,
        to: 1,
        config: {
            damping: 20,
            stiffness: 100,
        }
    });

    const opacity = spring({
        frame,
        fps,
        from: 0,
        to: 1,
        config: {
            damping: 15,
        }
    });

    // Gentle Y movement for entrance
    const translateY = spring({
        frame,
        fps,
        from: 30,
        to: 0,
        config: {
            damping: 18,
        }
    });

    return (
        <AbsoluteFill
            style={{
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0 100px',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    textAlign: 'center',
                    transform: `translateY(${translateY}px) scale(${scale})`,
                    opacity,
                }}
            >
                {/* Main heading text - Black with white border */}
                <h1
                    style={{
                        fontSize: '150px',
                        fontFamily: 'Montserrat, Impact, sans-serif',
                        fontWeight: 900,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'white',
                        margin: 0,
                        padding: 0,
                        lineHeight: 1.1,
                        WebkitTextStroke: '8px black',
                        paintOrder: 'stroke fill',
                        textShadow: '0 10px 20px rgba(0,0,0,0.5)',
                    }}
                >
                    {text}
                </h1>
            </div>
        </AbsoluteFill>
    );
};
