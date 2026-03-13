import { NextResponse } from 'next/server';
import { TicketDatabase } from '@/lib/server/db';

export async function GET() {
  try {
    const db = new TicketDatabase();
    const stocks = await db.getPremiumStocks();

    const status = {
      weekly: stocks.weekly > 0 ? 'in_stock' : 'out_of_stock',
      monthly: stocks.monthly > 0 ? 'in_stock' : 'out_of_stock',
      lifetime: stocks.lifetime > 0 ? 'in_stock' : 'out_of_stock',
    };

    return NextResponse.json({ stocks, status });
  } catch (error) {
    console.error('Error loading premium stock:', error);
    return NextResponse.json({ error: 'Failed to load premium stock' }, { status: 500 });
  }
}
