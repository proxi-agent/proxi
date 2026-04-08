import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    message: 'NextAuth route scaffolded. Wire provider configuration here.',
  })
}

export async function POST() {
  return NextResponse.json(
    {
      message: 'NextAuth route scaffolded. Wire provider configuration here.',
    },
    { status: 501 },
  )
}
