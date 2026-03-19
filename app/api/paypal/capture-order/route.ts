import { NextRequest, NextResponse } from 'next/server';
import { PayPalSDK } from '@/lib/server/paypal';
import { JunkieKeySystem } from '@/lib/server/junkie';
import { TicketDatabase } from '@/lib/server/db';
import { EmailService } from '@/lib/server/email';
import { VatCalculator } from '@/lib/server/vat';

export async function POST(req: NextRequest) {
  try {
    const { orderID } = await req.json();

    if (!orderID) {
        return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    // Initialize Services
    const paypal = new PayPalSDK({
        clientId: process.env.PAYPAL_CLIENT_ID || '',
        clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
        sandboxMode: process.env.PAYPAL_SANDBOX === 'true'
    });

    const junkie = new JunkieKeySystem({
        webhookUrl: process.env.JUNKIE_WEBHOOK_URL,
        webhookUrlWeekly: process.env.JUNKIE_WEBHOOK_URL_WEEKLY,
        webhookUrlMonthly: process.env.JUNKIE_WEBHOOK_URL_MONTHLY,
        webhookUrlLifetime: process.env.JUNKIE_WEBHOOK_URL_LIFETIME,
        hmacSecret: process.env.JUNKIE_HMAC_SECRET,
        provider: process.env.JUNKIE_PROVIDER,
        defaultService: process.env.JUNKIE_SERVICE
    });

    const db = new TicketDatabase(); // Handles Payments too
    const emailService = new EmailService();

    // 1. Capture PayPal Order
    const captureData = await paypal.captureOrder(orderID);
    const paymentInfo = paypal.extractPaymentInfo(captureData);

    if (paymentInfo.status !== 'COMPLETED') {
        throw new Error('Payment not completed');
    }

    // FIX: Override amount with Base Price (Pre-Tax) for DB and Display
    // We only want to charge VAT on PayPal, but record the base price internally.
    const tierPricing: Record<string, number> = {
        weekly: 3,
        monthly: 5,
        lifetime: 10
    };
    
    // Normalize tier and get base amount
    const normalizedTier = (paymentInfo.tier || 'weekly').toLowerCase();
    const baseAmount = tierPricing[normalizedTier] !== undefined 
        ? tierPricing[normalizedTier] 
        : paymentInfo.amount;

    // Update paymentInfo to use the base amount for DB saving
    paymentInfo.amount = baseAmount;
    paymentInfo.tier = normalizedTier;

    // 2. Check if transaction already processed
    if (await db.transactionExists(paymentInfo.transactionId)) {
        console.log('Transaction already processed:', paymentInfo.transactionId);
        const existingPayment = await db.getPayment(paymentInfo.transactionId);
        
        // SELF-HEALING: If payment exists but keys are missing, allow fall-through to generate keys!
        if (existingPayment && existingPayment.generated_keys && existingPayment.generated_keys.length > 0) {
            console.log('Returning existing keys for transaction');
            
            // Calculate base tier price based on stored tier (for legacy records)
            const storedBaseAmount = tierPricing[existingPayment.tier] || existingPayment.amount;
            
            return NextResponse.json({ 
                success: true, 
                message: 'Transaction already processed',
                details: paymentInfo,
                keys: existingPayment.generated_keys,
                tier: existingPayment.tier,
                amount: storedBaseAmount, // Return base price
                currency: existingPayment.currency
            });
        }
        console.warn('⚠️ Transaction exists but has NO keys. Retrying generation...');
        // Fall through to generate keys again!
    }

    const stockDecremented = await db.decrementPaymentMethodStock(paymentInfo.tier, 'paypal');
    if (!stockDecremented) {
        console.warn(`⚠️ Could not decrement PayPal stock for tier ${paymentInfo.tier}. The order will still be fulfilled.`);
    }

    // Determine validity based on tier (Legacy Logic)
    const validityMap: Record<string, number> = {
        weekly: 168,
        monthly: 720,
        lifetime: 0
    };
    const validity = (validityMap[paymentInfo.tier] !== undefined) ? validityMap[paymentInfo.tier] : 168;

    // 3. Generate Key via Junkie
    const keyResult = await junkie.generateKey({
        tier: paymentInfo.tier,
        validity: validity,
        quantity: 1,
        userInfo: {
            email: paymentInfo.payerEmail,
            payerId: paymentInfo.payerId
        },
        paymentInfo: {
            amount: paymentInfo.amount,
            currency: paymentInfo.currency,
            transactionId: paymentInfo.transactionId
        }
    });

    if (!keyResult.success) {
        console.error('Key generation failed:', keyResult.error);
        // We still save the payment but mark keys as null? Or handle partial failure.
        // For now, logging error.
    }

    const keys = (keyResult.success && keyResult.keys) ? keyResult.keys : [];

    // 4. Save to Database (NOW SAVES BASE AMOUNT)
    await db.savePayment({
        ...paymentInfo,
        keys: keys
    });

    // 5. Send Email
    if (keys.length > 0) {
        await emailService.sendKeyEmail(
            paymentInfo.payerEmail,
            keys[0],
            paymentInfo.tier,
            paymentInfo.transactionId
        );
        // Discord webhook is sent after the user completes game selection (see /api/orders/[id]/game-selection)
    }

    return NextResponse.json({
        success: true,
        orderId: paymentInfo.orderId,
        transactionId: paymentInfo.transactionId,
        tier: paymentInfo.tier,
        amount: baseAmount, // Return base price
        currency: paymentInfo.currency,
        keys: keys,
        emailSent: true,
        // Customer Details
        payerEmail: paymentInfo.payerEmail,
        payerName: paymentInfo.payerName,
        payerId: paymentInfo.payerId,
        createTime: paymentInfo.createTime,
        // Debugging info
        junkieError: keyResult.success ? null : keyResult.error,
        junkieDetails: keyResult.success ? null : keyResult.details
    });

  } catch (error: any) {
    console.error('Capture Order Error:', error);
    return NextResponse.json(
        { error: error.message || 'Failed to capture order' }, 
        { status: 500 }
    );
  }
}
