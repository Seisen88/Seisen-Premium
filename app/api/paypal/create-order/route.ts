import { NextRequest, NextResponse } from 'next/server';
import { PayPalSDK } from '@/lib/server/paypal';
import { VatCalculator } from '@/lib/server/vat';
import { TicketDatabase } from '@/lib/server/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tier } = body;

    // Pricing (Server-side validation)
    const pricing: Record<string, number> = {
        weekly: 3,
        monthly: 5,
        lifetime: 10
    };

    if (!tier || !pricing[tier]) {
         return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

        const db = new TicketDatabase();
        const currentStock = await db.getPremiumStock(tier);
        if (currentStock <= 0) {
            return NextResponse.json({ error: 'This premium plan is out of stock' }, { status: 409 });
        }

    const baseAmount = pricing[tier];

    // VAT Calculation
    const country = VatCalculator.getCountryFromRequest(req);
    const taxDetails = VatCalculator.calculateTax(baseAmount, country);

    const paypal = new PayPalSDK({
        clientId: process.env.PAYPAL_CLIENT_ID || '',
        clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
        sandboxMode: process.env.PAYPAL_SANDBOX === 'true'
    });

    // Dynamic Frontend URL for Redirects
    // Always use the origin of the request to ensure the user is returned to the correct domain they are visiting.
    const frontendUrl = req.nextUrl.origin;

    const returnUrl = `${frontendUrl}/premium`;
    const cancelUrl = `${frontendUrl}/premium?canceled=true`;
    
    const orderData = {
        amount: taxDetails.totalAmount,
        currency: 'EUR',
        description: 'Seisen Hub Premium Key',
        tier,
        returnUrl,
        cancelUrl,
        breakdown: {
            item_total: { currency_code: 'EUR', value: baseAmount.toFixed(2) },
            tax_total: { currency_code: 'EUR', value: taxDetails.taxAmount.toFixed(2) }
        }
    };

    const order = await paypal.createOrder(orderData);
    return NextResponse.json({
        ...order,
        taxDetails: {
            country,
            vatRate: taxDetails.vatRate,
            taxAmount: taxDetails.taxAmount,
            subtotal: taxDetails.subtotal,
            totalAmount: taxDetails.totalAmount
        }
    });

  } catch (error: any) {
    console.error('Create Order Error:', error);
    return NextResponse.json(
        { error: error.message || 'Failed to create order' }, 
        { status: 500 }
    );
  }
}
