import { NextResponse } from 'next/server'

/** Log the real error server-side; return a generic message to clients. */
export function internalError(context: string, error: unknown) {
  const err = error as Error
  console.error(`${context}:`, err)
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}
