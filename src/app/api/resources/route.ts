import { NextResponse } from 'next/server';
import { listResources } from '@/lib/services/resources';

export async function GET() {
  return NextResponse.json(listResources());
}
