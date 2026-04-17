import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract'
import { Injectable } from '@nestjs/common'

type OcrDocumentInput = {
  storageBucket?: string
  storageKey: string
}

export interface OcrResult {
  pageCount: number
  rawText: string
}

@Injectable()
export class OcrService {
  private readonly region = process.env.AWS_REGION || 'us-east-1'
  private readonly enabled = process.env.TEXTRACT_ENABLED === 'true'
  private readonly textractClient = new TextractClient({ region: this.region })

  async extractDocumentText(input: OcrDocumentInput): Promise<OcrResult> {
    if (!this.enabled || !input.storageBucket) {
      return {
        pageCount: 1,
        rawText: `Mock OCR text for ${input.storageKey}`,
      }
    }

    const result = await this.textractClient.send(
      new DetectDocumentTextCommand({
        Document: {
          S3Object: {
            Bucket: input.storageBucket,
            Name: input.storageKey,
          },
        },
      }),
    )

    const lines = (result.Blocks || []).filter(block => block.BlockType === 'LINE').map(block => block.Text || '')
    const pages = new Set((result.Blocks || []).map(block => block.Page || 1))
    return {
      pageCount: pages.size || 1,
      rawText: lines.join('\n'),
    }
  }
}
