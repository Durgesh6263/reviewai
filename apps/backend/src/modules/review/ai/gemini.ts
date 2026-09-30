/**
 * Gemini Provider
 * ReviewAI SaaS Platform
 * Google Gemini implementation for review generation
 */

import { AIProvider, AIProviderConfig, ReviewGenerationInput, ReviewGenerationOutput, TokenUsage } from '../types';
import { ReviewAIProvider } from './factory';

export class GeminiProvider implements ReviewAIProvider {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gemini-flash-latest';
    this.baseURL = config.baseURL || 'https://generativelanguage.googleapis.com/v1beta';
  }

  async generateReview(input: ReviewGenerationInput): Promise<ReviewGenerationOutput> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(input);
    const systemPrompt = this.getSystemPrompt(input.tone || 'friendly');

    const response = await fetch(`${this.baseURL}/models/${this.model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemPrompt}\n\n${prompt}` }
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Gemini API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number } };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const generationTimeMs = Date.now() - startTime;

    const tokenUsage: TokenUsage | undefined = data.usageMetadata ? {
      prompt_tokens: data.usageMetadata.promptTokenCount,
      completion_tokens: data.usageMetadata.candidatesTokenCount,
      total_tokens: data.usageMetadata.totalTokenCount,
    } : undefined;

    return {
      text,
      tokenUsage,
      generationTimeMs,
    };
  }

  getProviderName(): AIProvider {
    return 'gemini';
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