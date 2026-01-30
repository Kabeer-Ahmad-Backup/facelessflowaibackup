export interface WordTiming {
    word: string;
    startTime: number; // in seconds
    endTime: number;
}

/**
 * Estimates word timings by dividing total duration evenly across words
 */
export function estimateWordTimings(text: string, durationInSeconds: number): WordTiming[] {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];

    const timePerWord = durationInSeconds / words.length;

    return words.map((word, index) => ({
        word,
        startTime: index * timePerWord,
        endTime: (index + 1) * timePerWord
    }));
}

/**
 * Gets the currently active word based on current time
 */
export function getCurrentWordIndex(timings: WordTiming[], currentTimeInSeconds: number): number {
    return timings.findIndex(t =>
        currentTimeInSeconds >= t.startTime && currentTimeInSeconds < t.endTime
    );
}

/**
 * Breaks text into readable lines (max words per line)
 */
export function breakIntoLines(words: string[], maxWordsPerLine: number = 6): string[][] {
    const lines: string[][] = [];
    for (let i = 0; i < words.length; i += maxWordsPerLine) {
        lines.push(words.slice(i, i + maxWordsPerLine));
    }
    return lines;
}
