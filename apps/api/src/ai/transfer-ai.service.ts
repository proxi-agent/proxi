import { Injectable } from '@nestjs/common'
import OpenAI from 'openai'

import type { TransferCanonicalData } from '../cases/cases.service.js'

export interface TransferExtractionOutput {
  completenessScore: number
  confidence: number
  issues: string[]
  model: string
  payload: TransferCanonicalData
  provider: string
}

@Injectable()
export class TransferAiService {
  private readonly enabled = Boolean(process.env.OPENAI_API_KEY)
  private readonly model = process.env.OPENAI_TRANSFER_MODEL || 'gpt-4.1-mini'
  private readonly promptVersion = 'stock-transfer-v1'
  private readonly client = this.enabled ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

  getPromptVersion(): string {
    return this.promptVersion
  }

  async extractCanonicalData(rawText: string): Promise<TransferExtractionOutput> {
    if (!this.enabled || !this.client) {
      return this.buildHeuristicFallback(rawText)
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'Extract a stock transfer packet into canonical JSON. Preserve only values present in the document. Return high-quality confidence and completeness scores and list unresolved issues.',
        },
        {
          role: 'user',
          content: rawText,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'transfer_extraction',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              confidence: { type: 'number' },
              completenessScore: { type: 'number' },
              issues: { type: 'array', items: { type: 'string' } },
              payload: {
                type: 'object',
                additionalProperties: true,
              },
            },
            required: ['confidence', 'completenessScore', 'issues', 'payload'],
          },
        },
      },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content) as {
      completenessScore?: number
      confidence?: number
      issues?: string[]
      payload?: TransferCanonicalData
    }

    return {
      completenessScore: clamp01(parsed.completenessScore),
      confidence: clamp01(parsed.confidence),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      model: this.model,
      payload: parsed.payload || {},
      provider: 'openai',
    }
  }

  private buildHeuristicFallback(rawText: string): TransferExtractionOutput {
    const normalized = rawText.toLowerCase()
    const issues: string[] = []

    if (!normalized.includes('medallion')) {
      issues.push('Medallion signature guarantee not detected in OCR text.')
    }
    if (!normalized.includes('account number')) {
      issues.push('Source account number is missing or unreadable.')
    }
    if (!normalized.includes('tax id') && !normalized.includes('ssn') && !normalized.includes('ein')) {
      issues.push('Destination tax identifier could not be identified.')
    }

    return {
      completenessScore: clamp01(1 - issues.length * 0.2),
      confidence: clamp01(0.78 - issues.length * 0.08),
      issues,
      model: 'heuristic-fallback',
      payload: {},
      provider: 'heuristic',
    }
  }
}

function clamp01(value?: number): number {
  const numeric = Number(value ?? 0)
  if (Number.isNaN(numeric)) {
    return 0
  }
  return Math.max(0, Math.min(1, numeric))
}
