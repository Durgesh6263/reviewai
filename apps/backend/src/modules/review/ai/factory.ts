/**
 * AI Provider Factory
 * ReviewAI SaaS Platform
 * Abstracts AI providers for review generation
 */

import { AIProvider, AIProviderConfig, ReviewGenerationInput, ReviewGenerationOutput } from '../types';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';

export class AIProviderFactory {
  private providers: Map<AIProvider, ReviewAIProvider> = new Map();
  private defaultProvider: AIProvider;

  constructor(config: Partial<Record<AIProvider, AIProviderConfig>>) {
    this.defaultProvider = config.openai ? 'openai' : 'gemini';

    if (config.openai) {
      this.providers.set('openai', new OpenAIProvider(config.openai));
    }

    if (config.gemini) {
      this.providers.set('gemini', new GeminiProvider(config.gemini));
    }
  }

  getProvider(provider: AIProvider = this.defaultProvider): ReviewAIProvider {
    const aiProvider = this.providers.get(provider);

    if (!aiProvider) {
      throw new Error(`AI provider '${provider}' not configured`);
    }

    return aiProvider;
  }

  getDefaultProvider(): AIProvider {
    return this.defaultProvider;
  }

  hasProvider(provider: AIProvider): boolean {
    return this.providers.has(provider);
  }
}

export interface ReviewAIProvider {
  generateReview(input: ReviewGenerationInput): Promise<ReviewGenerationOutput>;
  getProviderName(): AIProvider;
}