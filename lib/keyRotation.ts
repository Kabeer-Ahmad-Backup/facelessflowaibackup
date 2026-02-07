/**
 * API Key Rotation and Load Balancing Utility
 * Provides round-robin key selection with retry support
 */

class KeyRotation {
    private openaiIndex = 0;
    private minimaxIndex = 0;
    private runwareIndex = 0;

    private openaiKeys: string[];
    private minimaxKeys: string[];
    private runwareKeys: string[];

    constructor() {
        // Load all available keys from environment
        this.openaiKeys = [
            process.env.OPENAI_API_KEY,
            process.env.OPENAI_API_KEY1,
            process.env.OPENAI_API_KEY2,
            process.env.OPENAI_API_KEY3,
        ].filter(Boolean) as string[];

        this.minimaxKeys = [
            process.env.MINIMAX_API_KEY,
            process.env.MINIMAX_API_KEY1,
            process.env.MINIMAX_API_KEY2,
            process.env.MINIMAX_API_KEY3,
        ].filter(Boolean) as string[];

        this.runwareKeys = [
            process.env.RUNWARE_API_KEY,
            process.env.RUNWARE_API_KEY1,
            process.env.RUNWARE_API_KEY2,
            process.env.RUNWARE_API_KEY3,
        ].filter(Boolean) as string[];

        console.log(`[KeyRotation] Loaded ${this.openaiKeys.length} OpenAI keys, ${this.minimaxKeys.length} Minimax keys, ${this.runwareKeys.length} Runware keys`);
    }

    /**
     * Get next OpenAI API key using round-robin
     */
    getNextOpenAIKey(): string {
        if (this.openaiKeys.length === 0) {
            throw new Error('No OpenAI API keys available');
        }
        const key = this.openaiKeys[this.openaiIndex];
        this.openaiIndex = (this.openaiIndex + 1) % this.openaiKeys.length;
        console.log(`[KeyRotation] Using OpenAI key #${this.openaiIndex}`);
        return key;
    }

    /**
     * Get next Minimax API key using round-robin
     */
    getNextMinimaxKey(): string {
        if (this.minimaxKeys.length === 0) {
            throw new Error('No Minimax API keys available');
        }
        const key = this.minimaxKeys[this.minimaxIndex];
        this.minimaxIndex = (this.minimaxIndex + 1) % this.minimaxKeys.length;
        console.log(`[KeyRotation] Using Minimax key #${this.minimaxIndex}`);
        return key;
    }

    /**
     * Get next Runware API key using round-robin
     */
    getNextRunwareKey(): string {
        if (this.runwareKeys.length === 0) {
            throw new Error('No Runware API keys available');
        }
        const key = this.runwareKeys[this.runwareIndex];
        this.runwareIndex = (this.runwareIndex + 1) % this.runwareKeys.length;
        console.log(`[KeyRotation] Using Runware key #${this.runwareIndex}`);
        return key;
    }

    /**
     * Retry logic wrapper - attempts operation with different key on failure
     */
    async withRetry<T>(
        operation: (key: string) => Promise<T>,
        getNextKey: () => string,
        maxRetries: number = 1
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const key = getNextKey();
                const result = await operation(key);

                if (attempt > 0) {
                    console.log(`[KeyRotation] Retry succeeded on attempt ${attempt + 1}`);
                }

                return result;
            } catch (error: any) {
                lastError = error;
                console.warn(`[KeyRotation] Attempt ${attempt + 1} failed:`, error.message);

                if (attempt < maxRetries) {
                    console.log(`[KeyRotation] Retrying with different key...`);
                }
            }
        }

        throw lastError || new Error('All retry attempts failed');
    }
}

// Singleton instance
const keyRotation = new KeyRotation();

export default keyRotation;
