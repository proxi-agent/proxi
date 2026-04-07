import { Body, Controller, Post } from '@nestjs/common'

@Controller('evidence')
export class EvidenceController {
  @Post('upload')
  upload(@Body() body: any) {
    // In a production system you would generate a presigned URL from object storage (S3, GCS).
    // Here we return a dummy URL and echo the document type requested.
    const { docType } = body
    return {
      uploadUrl: 'https://example.com/presigned-upload-url',
      docType,
    }
  }
}
