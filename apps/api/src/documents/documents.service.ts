import { randomUUID } from 'node:crypto'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable } from '@nestjs/common'

type UploadIntentInput = {
  caseId: number
  contentType: string
  fileName: string
}

type UploadIntent = {
  storageBucket?: string
  storageKey: string
  uploadUrl: string
}

@Injectable()
export class DocumentsService {
  private readonly bucket = process.env.TRANSFER_DOCS_BUCKET || ''
  private readonly region = process.env.AWS_REGION || 'us-east-1'
  private readonly uploadTtlSeconds = Number(process.env.TRANSFER_UPLOAD_URL_TTL_SECONDS || '900')
  private readonly s3Client = new S3Client({ region: this.region })

  async createUploadIntent(input: UploadIntentInput): Promise<UploadIntent> {
    const sanitizedName = input.fileName.trim().replaceAll(/\s+/g, '-')
    const storageKey = `transfers/${input.caseId}/${randomUUID()}-${sanitizedName}`

    if (!this.bucket) {
      return {
        storageKey,
        uploadUrl: `mock://uploads/${storageKey}`,
      }
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: input.contentType,
      Key: storageKey,
    })
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: this.uploadTtlSeconds })

    return {
      storageBucket: this.bucket,
      storageKey,
      uploadUrl,
    }
  }
}
