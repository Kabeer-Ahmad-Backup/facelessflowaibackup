export type ProjectApi = {
    id: string;
    user_id: string;
    script: string;
    status: 'draft' | 'generating' | 'rendering' | 'done' | 'error';
    settings: ProjectSettings;
    created_at: string;
    video_url?: string | null;
};

export type ProjectSettings = {
    aspectRatio: '16:9' | '9:16' | '1:1';
    visualStyle: 'zen' | 'normal' | 'stick' | 'health' | 'cartoon' | 'art' | 'stock_natural' | 'clean_illustration' | 'stock_vector' | 'stock_art';
    imageModel: 'fal' | 'gemini' | 'runware';  // Renamed from imageProvider for clarity or alias? user said "image generator". Let's stick to imageProvider to match Python script logic if possible, but valid types are key.
    audioVoice: string;
    disclaimerEnabled: boolean;
    captions: {
        enabled: boolean;
        position: 'bottom' | 'mid-bottom' | 'center' | 'top';
        font: 'helvetica' | 'serif' | 'brush';
        fontSize: 'small' | 'medium' | 'large' | 'xlarge';
        animation: 'none' | 'typewriter' | 'fade-in' | 'slide-up' | 'bounce';
        strokeWidth: 'thin' | 'medium' | 'thick' | 'bold';
    };
    audioWave: {
        enabled: boolean;
        position: 'bottom' | 'center' | 'top' | 'mid-bottom';
        style: 'bars' | 'wave' | 'round';
        color: string;
    };
    transitions: {
        mode: 'random' | 'specific';
        type: 'fadein' | 'crossfade' | 'white_flash' | 'camera_flash' | 'none';
        transitionSound?: 'none' | 'camera_flash' | 'swoosh';
    };
    cameraMovements?: ('zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down' | 'static')[];
    renderParts?: {
        id: string; // unique ID for this part (e.g. part-1)
        bucketName: string;
        renderId: string;
        status: 'rendering' | 'done' | 'error';
        url?: string;
        part: number; // 1-based index
        frameCount: number;
    }[];
};

export type SceneApi = {
    id: string;
    project_id: string;
    order_index: number;
    text: string;
    prompt: string | null;
    image_url: string | null;
    audio_url: string | null;
    duration: number | null;
    status: 'pending' | 'ready' | 'error';
    visual_style?: string | null;
    media_type?: 'image' | 'video';
    attribution?: string | null;
};
