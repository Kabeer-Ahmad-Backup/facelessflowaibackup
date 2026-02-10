/**
 * API Key Rotation and Load Balancing Utility
 * Provides round-robin key selection with retry support
 */

class KeyRotation {
    private static instance: KeyRotation;

    private openaiKeys: string[] = [];
    private minimaxKeys: string[] = [];
    private runwareKeys: string[] = [];
    private replicateKeys: string[] = [];
    private minimaxGroupId: string | null = null; // Store GroupID once

    private openaiIndex = 0;
    private minimaxIndex = 0;
    private runwareIndex = 0;
    private replicateIndex = 0;

    private constructor() {
        this.loadKeys();
    }

    private loadKeys() {
        // Load OpenAI keys
        const openaiPrimary = process.env.OPENAI_API_KEY;
        if (openaiPrimary) this.openaiKeys.push(openaiPrimary);

        for (let i = 1; i <= 10; i++) {
            const key = process.env[`OPENAI_API_KEY${i}`];
            if (key) this.openaiKeys.push(key);
        }

        // Load Minimax keys
        const minimaxPrimary = process.env.MINIMAX_API_KEY;
        if (minimaxPrimary) {
            this.minimaxKeys.push(minimaxPrimary);
            // Extract GroupID from primary key if not in env
            if (!process.env.MINIMAX_GROUP_ID) {
                this.minimaxGroupId = this.extractMinimaxGroupId(minimaxPrimary);
            }
        }

        for (let i = 1; i <= 10; i++) {
            const key = process.env[`MINIMAX_API_KEY${i}`];
            if (key) this.minimaxKeys.push(key);
        }

        // Use env GroupID if available, otherwise use extracted one
        if (process.env.MINIMAX_GROUP_ID) {
            this.minimaxGroupId = process.env.MINIMAX_GROUP_ID;
        }

        // Load Runware keys
        const runwarePrimary = process.env.RUNWARE_API_KEY;
        if (runwarePrimary) this.runwareKeys.push(runwarePrimary);

        for (let i = 1; i <= 10; i++) {
            const key = process.env[`RUNWARE_API_KEY${i}`];
            if (key) this.runwareKeys.push(key);
        }

        // Load Replicate keys
        const replicatePrimary = process.env.REPLICATE_API_TOKEN;
        if (replicatePrimary) this.replicateKeys.push(replicatePrimary);

        for (let i = 1; i <= 10; i++) {
            const key = process.env[`REPLICATE_API_TOKEN${i}`];
            if (key) this.replicateKeys.push(key);
        }

        console.log(`[KeyRotation] Loaded ${this.openaiKeys.length} OpenAI keys, ${this.minimaxKeys.length} Minimax keys, ${this.runwareKeys.length} Runware keys, ${this.replicateKeys.length} Replicate keys`);
        if (this.minimaxGroupId) {
            console.log(`[KeyRotation] Minimax GroupID: ${this.minimaxGroupId}`);
        }
    }

    private extractMinimaxGroupId(apiKey: string): string | null {
        try {
            const parts = apiKey.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                return payload.GroupID || null;
            }
        } catch (e) {
            console.warn("[KeyRotation] Failed to extract GroupID from Minimax API Key", e);
        }
        return null;
    }

    public static getInstance(): KeyRotation {
        if (!KeyRotation.instance) {
            KeyRotation.instance = new KeyRotation();
        }
        return KeyRotation.instance;
    }

    public getNextOpenAIKey(): string {
        if (this.openaiKeys.length === 0) {
            throw new Error('No OpenAI API keys available');
        }
        const key = this.openaiKeys[this.openaiIndex % this.openaiKeys.length];
        console.log(`[KeyRotation] Using OpenAI key #${(this.openaiIndex % this.openaiKeys.length) + 1}`);
        this.openaiIndex++;
        return key;
    }

    public getNextMinimaxKey(): string {
        if (this.minimaxKeys.length === 0) {
            throw new Error('No Minimax API keys available');
        }
        const key = this.minimaxKeys[this.minimaxIndex % this.minimaxKeys.length];
        console.log(`[KeyRotation] Using Minimax key #${(this.minimaxIndex % this.minimaxKeys.length) + 1}`);
        this.minimaxIndex++;
        return key;
    }

    public getNextRunwareKey(): string {
        if (this.runwareKeys.length === 0) {
            throw new Error('No Runware API keys available');
        }
        const key = this.runwareKeys[this.runwareIndex % this.runwareKeys.length];
        console.log(`[KeyRotation] Using Runware key #${(this.runwareIndex % this.runwareKeys.length) + 1}`);
        this.runwareIndex++;
        return key;
    }

    public getNextReplicateKey(): string {
        if (this.replicateKeys.length === 0) {
            throw new Error('No Replicate API keys available');
        }
        const key = this.replicateKeys[this.replicateIndex % this.replicateKeys.length];
        console.log(`[KeyRotation] Using Replicate key #${(this.replicateIndex % this.replicateKeys.length) + 1}`);
        this.replicateIndex++;
        return key;
    }

    public getMinimaxGroupId(): string | null {
        return this.minimaxGroupId;
    }

    // Generic retry wrapper
    public async withRetry<T>(
        operation: (apiKey: string) => Promise<T>,
        getNextKey: () => string,
        maxRetries: number = 1
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
            try {
                const apiKey = getNextKey();
                return await operation(apiKey);
            } catch (error) {
                lastError = error as Error;
                console.error(`[KeyRotation] Attempt ${attempt} failed:`, lastError.message);

                if (attempt <= maxRetries) {
                    console.log(`[KeyRotation] Retrying with different key...`);
                } else {
                    console.error(`[KeyRotation] All retry attempts exhausted`);
                }
            }
        }

        throw lastError || new Error('Operation failed');
    }
}

const keyRotation = KeyRotation.getInstance();
export default keyRotation;
