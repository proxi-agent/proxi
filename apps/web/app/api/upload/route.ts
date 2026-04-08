import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    uploadUrl: 'https://example.com/upload-url',
  })
}
