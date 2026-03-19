import { NextRequest, NextResponse } from 'next/server';
import { TicketDatabase } from '@/lib/server/db';

export async function GET(_req: NextRequest) {
  try {
    const db = new TicketDatabase();
    const methodStocks = await db.getPaymentMethodStocks();
    return NextResponse.json({ methodStocks });
  } catch (error) {
    console.error('Error loading premium stock:', error);
    return NextResponse.json({ error: 'Failed to load premium stock' }, { status: 500 });
  }
}
