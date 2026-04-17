import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'

import { TransferAiService } from '../ai/transfer-ai.service.js'
import { CasesService } from '../cases/cases.service.js'
import { OcrService } from '../ocr/ocr.service.js'

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly enabled = process.env.TRANSFER_JOB_WORKER_ENABLED !== 'false'
  private readonly pollMs = Number(process.env.TRANSFER_JOB_POLL_MS || '3000')
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly casesService: CasesService,
    private readonly ocrService: OcrService,
    private readonly transferAiService: TransferAiService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      return
    }
    this.timer = setInterval(() => {
      this.processOne().catch(() => {
        // Keep polling even if one iteration fails; specific failures are tracked per job.
      })
    }, this.pollMs)
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async processOne(): Promise<void> {
    if (this.running) {
      return
    }
    this.running = true
    let activeJobId: number | null = null

    try {
      const job = await this.casesService.getQueuedAiJob()
      if (!job) {
        return
      }
      activeJobId = job.id

      const transferCase = await this.casesService.getCaseById(job.caseId)
      const textSegments: string[] = []

      for (const document of transferCase.documents) {
        const ocr = await this.ocrService.extractDocumentText({
          storageBucket: document.storageBucket,
          storageKey: document.storageKey,
        })
        textSegments.push(ocr.rawText)
      }

      if (!textSegments.length) {
        textSegments.push('No uploaded documents were found for this transfer case.')
      }

      const rawText = textSegments.join('\n\n')
      const extraction = await this.transferAiService.extractCanonicalData(rawText)
      await this.casesService.recordExtraction(
        {
          caseId: job.caseId,
          completenessScore: extraction.completenessScore,
          confidence: extraction.confidence,
          extractionPayload: extraction.payload as Record<string, unknown>,
          issues: extraction.issues,
          model: extraction.model,
          promptVersion: this.transferAiService.getPromptVersion(),
          provider: extraction.provider,
          rawText,
        },
        'ai_worker',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI worker failure'
      if (activeJobId !== null) {
        await this.casesService.markAiJobFailed(activeJobId, 'ai_worker', message)
      }
    } finally {
      this.running = false
    }
  }
}
