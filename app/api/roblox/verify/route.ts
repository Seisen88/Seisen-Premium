import { NextResponse } from 'next/server';
import { RobloxIntegration } from '@/lib/server/roblox';
import { JunkieKeySystem } from '@/lib/server/junkie';
import { TicketDatabase } from '@/lib/server/db';

const robloxIntegration = new RobloxIntegration();
const db = new TicketDatabase();

const junkieSystem = new JunkieKeySystem({
    webhookUrl: process.env.JUNKIE_WEBHOOK_URL,
    webhookUrlWeekly: process.env.JUNKIE_WEBHOOK_URL_WEEKLY,
    webhookUrlMonthly: process.env.JUNKIE_WEBHOOK_URL_MONTHLY,
    webhookUrlLifetime: process.env.JUNKIE_WEBHOOK_URL_LIFETIME,
    hmacSecret: process.env.JUNKIE_HMAC_SECRET,
    provider: process.env.JUNKIE_PROVIDER,
    defaultService: process.env.JUNKIE_SERVICE
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { username, email, tier: requestedTier } = body;

        // Basic verification
        if (!email || !email.includes('@')) {
             return NextResponse.json({ error: 'Valid email is required for backup' }, { status: 400 });
        }

        if (!username || typeof username !== 'string' || username.trim() === '') {
            return NextResponse.json({ error: 'Roblox username is required' }, { status: 400 });
        }

        if (requestedTier && ['weekly', 'monthly', 'lifetime'].includes(String(requestedTier).toLowerCase())) {
            const preCheckStock = await db.getPremiumStock(String(requestedTier).toLowerCase());
            if (preCheckStock <= 0) {
                return NextResponse.json({
                    success: false,
                    error: 'This premium plan is out of stock'
                }, { status: 409 });
            }
        }

        console.log(`🎮 Verifying Roblox purchase for username: ${username}, Target Tier: ${requestedTier || 'Any'}`);

        // Verify the user owns the product
        const verification = await robloxIntegration.verifyPurchase(username.trim(), requestedTier);

        if (!verification.success || !verification.userId) {
            console.error('❌ Verification failed:', verification.error);
            return NextResponse.json({
                success: false,
                error: verification.error || 'Failed to verify purchase'
            }, { status: 400 });
        }

        console.log('✅ User owns product:', verification);

        // Generate transaction ID: ROBLOX-USERID-PRODUCTID
        const transactionId = robloxIntegration.generateTransactionId(verification.userId, verification.productId!);
        
        // --- RENEWAL / EXISTENCE LOGIC ---
        const currentUaid = verification.uaid;
        const tier = verification.tier || robloxIntegration.getTierForProduct(verification.productId || 0);
        
        const validityMap: Record<string, number> = {
            weekly: 168,
            monthly: 720,
            lifetime: 0
        };
        const validityHours = validityMap[tier] || 0;

        // Check if transaction exists
        const isDuplicate = await db.transactionExists(transactionId);
        let isRenewal = false;

        if (isDuplicate) {
            console.log(`ℹ️ User ${verification.username} already verified. Checking status...`);
            const existingPayment = await db.getPayment(transactionId);
            const storedUaid = existingPayment.roblox_uaid;

            // Check if re-purchased (New Asset created AFTER old payment)
            const assetCreatedTime = verification.created ? new Date(verification.created).getTime() : 0;
            const paymentCreatedTime = new Date(existingPayment.created_at).getTime();
            
            // If the Roblox Asset is newer than our DB record (by at least 5 mins), it's a re-purchase
            const isNewerPurchase = assetCreatedTime > (paymentCreatedTime + 300000);
            
            // Also keep UAID check as valid signal
            const isUaidChanged = (currentUaid && storedUaid && String(currentUaid) !== String(storedUaid));

            if (isNewerPurchase || isUaidChanged) {
                console.log(`✨ RENEWAL DETECTED!`);
                isRenewal = true;
            } else {
                // SAME ITEM logic
                const lastUpdate = new Date(existingPayment.updated_at);
                const now = new Date();
                const purchaseTime = isNaN(lastUpdate.getTime()) ? new Date(existingPayment.created_at) : lastUpdate;

                if (validityHours > 0) {
                     const expiryDate = new Date(purchaseTime.getTime() + (validityHours * 60 * 60 * 1000));
                     
                     if (now < expiryDate) {
                        // STILL ACTIVE
                        return NextResponse.json({
                            success: true,
                            keys: existingPayment.generated_keys,
                            tier,
                            transactionId,
                            message: 'Your key is still active',
                            alreadyClaimed: true,
                            isActive: true,
                            expiryDate: expiryDate.toISOString(),
                            userId: verification.userId,
                            username: verification.username
                        });
                     } else {
                        // EXPIRED
                        return NextResponse.json({
                             success: false,
                             error: 'Your key has expired. To get a new key, please DELETE the item from your Roblox inventory and BUY it again.',
                             isExpired: true,
                             tier
                        }, { status: 400 });
                     }
                } else {
                    // Lifetime
                     return NextResponse.json({
                        success: true,
                        keys: existingPayment.generated_keys,
                        tier,
                        transactionId,
                        message: 'You own a Lifetime key',
                        alreadyClaimed: true,
                        isActive: true,
                        expiryDate: null,
                        userId: verification.userId,
                        username: verification.username
                    });
                }
            }
        }

        // Robux prices per tier (in Robux)
        const robuxPriceMap: Record<string, number> = {
            weekly: 500,
            monthly: 800,
            lifetime: 1600
        };
        const robuxAmount = robuxPriceMap[tier] ?? 0;

        // Processing New Purchase OR Renewal
        const stockDecremented = await db.decrementPremiumStock(tier);
        if (!stockDecremented) {
            return NextResponse.json({
                success: false,
                error: 'This premium plan is out of stock'
            }, { status: 409 });
        }
        
        // 1. Save / Update Payment Record
        if (!isRenewal && !isDuplicate) {
            await db.savePayment({
                transactionId,
                payerEmail: email,
                payerId: `ROBLOX_${verification.userId}`,
                robloxUsername: verification.username,
                robloxUaid: currentUaid,
                tier,
                amount: robuxAmount,
                currency: 'ROBUX',
                status: 'COMPLETED',
                keys: null
            });
        } else if (isRenewal && currentUaid) {
             await db.updateRobloxPurchase(transactionId, currentUaid);
        }

        // 2. Generate Key
        console.log(`🔑 Generating ${isRenewal ? 'RENEWAL' : 'NEW'} key...`);
        const keyResult = await junkieSystem.generateKey({
            tier,
            validity: validityHours,
            quantity: 1,
            userInfo: {
                email: email,
                payerId: `ROBLOX_${verification.userId}`,
                robloxUsername: verification.username
            },
            paymentInfo: {
                amount: 0,
                currency: 'ROBUX',
                transactionId
            }
        });

        if (keyResult.success && keyResult.keys && keyResult.keys.length > 0) {
            // 3. Update DB with keys
            await db.updatePaymentKeys(transactionId, keyResult.keys);
 
            let newExpiryDate: string | null = null;
            if (validityHours > 0) {
                newExpiryDate = new Date(Date.now() + (validityHours * 60 * 60 * 1000)).toISOString();
            }

            // Discord webhook is sent after the user completes game selection (see /api/orders/[id]/game-selection)

             return NextResponse.json({
                success: true,
                keys: keyResult.keys,
                tier,
                transactionId,
                userId: verification.userId,
                username: verification.username,
                isRenewal,
                expiryDate: newExpiryDate,
                message: isRenewal ? 'Key renewed successfully!' : 'Purchase verified!'
             });

        } else {
             console.error('❌ Key generation failed:', keyResult.error);
             return NextResponse.json({
                success: false,
                error: 'Key generation failed. Please contact support.'
             }, { status: 500 });
        }

    } catch (error: any) {
        console.error('❌ Error verifying Roblox purchase:', error);
        return NextResponse.json({ error: 'Failed to verify purchase', details: error.message }, { status: 500 });
    }
}
