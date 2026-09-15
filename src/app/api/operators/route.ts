import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const rows = getDb()
    .prepare(`SELECT id, name, role FROM operators WHERE active = 1 ORDER BY id`)
    .all() as { id: number; name: string; role: string }[];
  return NextResponse.json({ operators: rows });
}
