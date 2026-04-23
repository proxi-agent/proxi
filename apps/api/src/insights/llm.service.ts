import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'

import type { PromptTemplate } from './prompts.js'

export interface LlmEnrichmentResult {
  /** True when the LLM was called and produced output. */
  used: boolean
  /** Operator-facing polished summary, or undefined if not generated. */
  summary?: string
  /** Structured errors propagated to the insight so the UI can show a subtle note. */
  error?: string
}

/**
 * LLM enrichment for insights. Intentionally:
 *  - optional (disabled when OPENAI_API_KEY is unset)
 *  - non-throwing (always returns a result, never crashes the caller)
 *  - grounded (context is structured JSON built from real records)
 *  - swappable (wraps OpenAI but only via a single `enrich()` method)
 */
@Injectable()
export class InsightsLlmService {
  private readonly logger = new Logger(InsightsLlmService.name)
  private readonly enabled = Boolean(process.env.OPENAI_API_KEY) && process.env.INSIGHTS_LLM_DISABLED !== '1'
  private readonly model = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4.1-mini'
  private readonly client = this.enabled ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
  private readonly timeoutMs = Number(process.env.INSIGHTS_LLM_TIMEOUT_MS || '4000')

  isEnabled(): boolean {
    return this.enabled
  }

  async enrich(template: PromptTemplate, context: Record<string, unknown>): Promise<LlmEnrichmentResult> {
    if (!this.enabled || !this.client) {
      return { used: false }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.client.chat.completions.create(
        {
          messages: [
            { content: template.system, role: 'system' },
            { content: template.user(context), role: 'user' },
          ],
          model: this.model,
          temperature: 0.2,
        },
        { signal: controller.signal },
      )
      const summary = response.choices[0]?.message?.content?.trim()
      if (!summary) {
        return { used: false }
      }
      return { summary, used: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LLM enrichment failed'
      this.logger.debug(`LLM enrichment failed: ${message}`)
      return { error: message, used: false }
    } finally {
      clearTimeout(timeout)
    }
  }
}
