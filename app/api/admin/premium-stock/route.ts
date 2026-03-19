import { NextRequest, NextResponse } from 'next/server';
import { TicketDatabase } from '@/lib/server/db';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Failed to update premium stock';
}

async function isAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = Buffer.from(token, 'base64').toString('ascii');
    const db = new TicketDatabase();
    return await db.validateAdminPassword(decoded);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const authorized = await isAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = new TicketDatabase();
    const methodStocks = await db.getPaymentMethodStocks();
    return NextResponse.json({ methodStocks });
  } catch (error) {
    console.error('Error fetching premium stock:', error);
    return NextResponse.json({ error: 'Failed to fetch premium stock' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authorized = await isAdmin(req);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const tier = String(body.tier || '').toLowerCase();
    const stock = Number(body.stock);
    const method = body.method ? String(body.method).toLowerCase() : null;

    if (!['weekly', 'monthly', 'lifetime'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      return NextResponse.json({ error: 'Stock must be a non-negative integer' }, { status: 400 });
    }
    if (!method || !['robux', 'paypal', 'gcash'].includes(method)) {
      return NextResponse.json({ error: 'Invalid or missing payment method' }, { status: 400 });
    }

    const db = new TicketDatabase();
    await db.setPaymentMethodStock(tier, method, stock);
    const methodStocks = await db.getPaymentMethodStocks();
    return NextResponse.json({ success: true, methodStocks });
  } catch (error) {
    console.error('Error updating premium stock:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
