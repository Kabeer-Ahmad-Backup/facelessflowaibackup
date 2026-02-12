'use server';

import { createClient } from '@/utils/supabase/server';
import keyRotation from '@/lib/keyRotation';
import OpenAI from 'openai';

function getOpenAIClient(apiKey: string) {
    return new OpenAI({ apiKey });
}

export async function generateHeadings(projectId: string) {
    const supabase = await createClient();

    // 1. Fetch project with script
    const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (error || !project) {
        throw new Error('Project not found');
    }

    // 2. Check if headings already exist (reuse logic)
    if (project.settings?.headings && project.settings.headings.length > 0) {
        console.log('[Headings] Reusing existing headings');
        return { success: true, headings: project.settings.headings };
    }

    // 3. Get script content
    const fullScript = project.script || '';

    if (!fullScript || fullScript.trim().length === 0) {
        throw new Error('No script content available');
    }

    console.log('[Headings] Extracting headings from script...');

    // 4. Call OpenAI to extract main heading texts
    const response = await keyRotation.withRetry(
        async (apiKey) => {
            const openai = getOpenAIClient(apiKey);
            return await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a content analysis expert. Analyze the script and extract main section headings.

CRITICAL RULES:
1. Return ONLY text that appears EXACTLY in the script (verbatim)
2. Extract natural section breaks and topic introductions
3. Each heading should be 2-8 words
4. Look for impactful statements that introduce new topics
5. Return as a JSON array of strings

Example: ["Welcome to our guide", "Understanding the basics", "Key takeaways"]

Do NOT create new text. Only extract existing phrases from the script.`
                    },
                    {
                        role: 'user',
                        content: `Script:\n\n${fullScript}`
                    }
                ],
                temperature: 0.3,
            });
        },
        () => keyRotation.getNextOpenAIKey(),
        1
    );

    const content = response.choices[0].message.content || '[]';
    let headings: string[] = [];

    try {
        // Strip markdown code blocks if present
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        headings = JSON.parse(cleanContent);
    } catch (e) {
        console.error('[Headings] Failed to parse OpenAI response:', e);
        throw new Error('Failed to parse headings from OpenAI');
    }

    if (!Array.isArray(headings) || headings.length === 0) {
        throw new Error('No headings extracted');
    }

    console.log(`[Headings] Extracted ${headings.length} headings:`, headings);

    // 5. Store in database
    const { error: updateError } = await supabase.from('projects').update({
        settings: {
            ...project.settings,
            headings
        }
    }).eq('id', projectId);

    if (updateError) {
        throw new Error('Failed to save headings to database');
    }

    console.log('[Headings] Saved to database');

    return { success: true, headings };
}
