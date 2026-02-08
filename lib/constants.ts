export const VOICE_ID_MAP: Record<string, string> = {
    "English_ManWithDeepVoice": "English_ManWithDeepVoice",
    "English_Trustworth_Man": "English_Trustworth_Man",
    "English_Sharp_Commentator": "English_Sharp_Commentator",
    "English_Woman_Soft": "English_Woman_Soft",
    "moss_audio_746bae72-cba9-11f0-bd68-decf32bbe21e": "moss_audio_746bae72-cba9-11f0-bd68-decf32bbe21e",
    "moss_audio_221ef11d-fac6-11f0-8725-da4a7a598c40": "moss_audio_221ef11d-fac6-11f0-8725-da4a7a598c40",
    "moss_audio_0048f511-fac6-11f0-bc3d-ee2c9c493651": "moss_audio_0048f511-fac6-11f0-bc3d-ee2c9c493651",
    "moss_audio_d84269fa-fac5-11f0-b1d3-3ae1917fa355": "moss_audio_d84269fa-fac5-11f0-b1d3-3ae1917fa355"
};

export const VOICE_OPTIONS = [
    // Existing Minimax voices
    { label: "Man With Deep Voice", value: "English_ManWithDeepVoice", id: "English_ManWithDeepVoice" },
    { label: "Trustworthy Man", value: "English_Trustworth_Man", id: "English_Trustworth_Man" },
    { label: "Sharp Commentator", value: "English_Sharp_Commentator", id: "English_Sharp_Commentator" },
    { label: "Soft Spoken Woman", value: "English_Woman_Soft", id: "English_Woman_Soft" },
    { label: "Barbara O'Neill", value: "moss_audio_746bae72-cba9-11f0-bd68-decf32bbe21e", id: "moss_audio_746bae72-cba9-11f0-bd68-decf32bbe21e" },
    { label: "James", value: "moss_audio_221ef11d-fac6-11f0-8725-da4a7a598c40", id: "moss_audio_221ef11d-fac6-11f0-8725-da4a7a598c40" },
    { label: "Grandpa", value: "moss_audio_0048f511-fac6-11f0-bc3d-ee2c9c493651", id: "moss_audio_0048f511-fac6-11f0-bc3d-ee2c9c493651" },
    { label: "Grandma", value: "moss_audio_d84269fa-fac5-11f0-b1d3-3ae1917fa355", id: "moss_audio_d84269fa-fac5-11f0-b1d3-3ae1917fa355" },

    // GenAIPro voices (ElevenLabs)
    { label: "Michael (Middle Age M)", value: "genaipro_QngvLQR8bsLR5bzoa6Vv", id: "genaipro_QngvLQR8bsLR5bzoa6Vv" },
    { label: "Regan (Middle Age W)", value: "genaipro_CRugt7r6KLDJbifthghJ", id: "genaipro_CRugt7r6KLDJbifthghJ" },
    { label: "Jim (Young M)", value: "genaipro_JjqNMa6BEYmyQYRCdHCa", id: "genaipro_JjqNMa6BEYmyQYRCdHCa" },
    { label: "David Boles (Old M)", value: "genaipro_y1adqrqs4jNaANXsIZnD", id: "genaipro_y1adqrqs4jNaANXsIZnD" },
    { label: "Tiffany (Middle Age W)", value: "genaipro_x9leqCOAXOcmC5jtkq65", id: "genaipro_x9leqCOAXOcmC5jtkq65" }
];

export const CAPTION_POSITIONS = [
    { label: "Bottom", value: "bottom" },
    { label: "Center", value: "center" },
    { label: "Top", value: "top" }
];

export const CAPTION_FONTS = [
    { label: "Helvetica (Modern)", value: "helvetica" },
    { label: "Serif (Classic)", value: "serif" },
    { label: "Brush (Artistic)", value: "brush" },
    { label: "Monospace (Code)", value: "monospace" }
];

export const CHARACTER_REFERENCE_MAP: Record<string, string> = {
    'grandpa': '/characters/grandpa.png',
    'grandma': '/characters/grandma.webp',
    'james': '/characters/james.webp',
    'dr_sticky': '/characters/dr_sticky.webp'
};
