/**
 * OpenAI Provider
 * ReviewAI SaaS Platform
 * OpenAI implementation for review generation
 */

import { AIProvider, AIProviderConfig, ReviewGenerationInput, ReviewGenerationOutput, TokenUsage } from '../types';
import { ReviewAIProvider } from './factory';

export class OpenAIProvider implements ReviewAIProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gpt-4o-mini';
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
  }

  async generateReview(input: ReviewGenerationInput): Promise<ReviewGenerationOutput> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(input);

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(input.tone || 'friendly'),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const generationTimeMs = Date.now() - startTime;

    const tokenUsage: TokenUsage | undefined = data.usage ? {
      prompt_tokens: data.usage.prompt_tokens,
      completion_tokens: data.usage.completion_tokens,
      total_tokens: data.usage.total_tokens,
    } : undefined;

    return {
      text,
      tokenUsage,
      generationTimeMs,
    };
  }

  getProviderName(): AIProvider {
    return 'openai';
  }

  private getSystemPrompt(tone: string): string {
    const toneInstructions: Record<string, string> = {
      professional: 'Write in a polished, professional tone. Be respectful and articulate.',
      casual: 'Write in a relaxed, informal tone. Use everyday language and contractions.',
      enthusiastic: 'Write with energy and excitement. Use expressive language naturally.',
      friendly: 'Write in a warm, approachable, and conversational tone that feels genuine.',
    };

    return `You are writing authentic, diverse Google reviews for local businesses.
${toneInstructions[tone] || toneInstructions.friendly}

CRITICAL RULES & GUIDELINES:
1. CUSTOMER PERSPECTIVE: Write strictly as a real customer who visited the business. 2-4 sentences.
2. CATEGORY-AWARE VOCABULARY: Use vocabulary appropriate to the business category (e.g. gym workout ambience vs cafe coffee aroma and taste vs healthcare professional staff and clean facility).
3. NEVER INVENT EXPERIENCES: Only describe aspects supported by customer-selected tags or notes.
   - Do NOT invent staff names.
   - Do NOT invent prices, specific transactions, or dish names unless mentioned by the customer.
   - HEALTHCARE / DENTAL MANDATE: NEVER invent clinical results, medical diagnoses, treatment outcomes, or patient symptoms. Only comment on customer service, staff demeanor, hygiene, and appointment timeliness.
4. RATING RESPECT:
   - For 1-3 stars, accurately reflect criticism and areas of dissatisfaction. Never force praise or positive cliches.
   - For 4-5 stars, reflect genuine appreciation.
5. NATURAL VARIATION & ANTI-REPETITION:
   - AVOID formulaic openers like "I had a great experience at..." or "Highly recommend...".
   - Start with varied sentence structures (e.g., lead with the specific highlight, the atmosphere, or a fresh perspective).`;
  }

  private buildPrompt(input: ReviewGenerationInput): string {
    const languageNames: Record<string, string> = {
      en: 'English',
      hi: 'Hindi',
      hinglish: 'Hinglish (Hindi written in English script)',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      it: 'Italian',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
    };

    const language = languageNames[input.language] || 'English';
    const stars = '★'.repeat(input.rating) + '☆'.repeat(5 - input.rating);
    const categoryDesc = input.businessCategoryName || input.businessCategory || 'local business';
    const tagsContext = input.tags && input.tags.length > 0 ? `Customer-selected highlights: ${input.tags.join(', ')}.` : '';
    const notesContext = input.customerNotes ? `Customer personal note: "${input.customerNotes}".` : '';
    const duplicateConstraint = input.duplicatePreventionPrompt ? `\nUNIQUENESS REQUIREMENT: ${input.duplicatePreventionPrompt}` : '';

    return `Write a ${language} Google review for "${input.businessName}" (${categoryDesc}).

Rating: ${input.rating}/5 stars (${stars})
Tone: ${input.tone || 'friendly'}
${tagsContext ? tagsContext + '\n' : ''}${notesContext ? notesContext + '\n' : ''}${duplicateConstraint ? duplicateConstraint + '\n' : ''}
Write a natural, authentic 2-4 sentence review strictly matching the above tags and rating.
CRITICAL: Do not invent unmentioned facts, staff names, or medical outcomes. Vary the sentence structure naturally.`;
  }
}