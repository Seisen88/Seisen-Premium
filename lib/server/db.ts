import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'public-anon-key-placeholder';

if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)) {
  console.warn('⚠️ Supabase credentials not found in environment variables. Using placeholder client; database requests will fail until env vars are set.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export class TicketDatabase {
  private client: SupabaseClient;
  private readonly premiumTiers = ['weekly', 'monthly', 'lifetime'];

  constructor() {
    this.client = supabase;
  }

  generateTicketNumber() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `TKT-${timestamp}-${random}`.toUpperCase();
  }

  async createTicket(ticketData: any) {
    const ticketNumber = this.generateTicketNumber();
    const { data, error } = await this.client
      .from('tickets')
      .insert([{
        ticket_number: ticketNumber,
        user_name: ticketData.userName,
        user_email: ticketData.userEmail,
        category: ticketData.category,
        subject: ticketData.subject,
        description: ticketData.description,
        status: 'open',
        updated_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('Error creating ticket in Supabase:', error);
      throw error;
    }
    return { id: data[0].id, ticketNumber };
  }

  async getTicket(ticketNumber: string) {
    const cleanNumber = ticketNumber ? ticketNumber.trim() : '';
    const { data, error } = await this.client
      .from('tickets')
      .select('*')
      .eq('ticket_number', cleanNumber)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching ticket:', error);
    }
    return data;
  }

  async getAllTickets() {
    const { data, error } = await this.client
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all tickets:', error);
      return [];
    }
    return data;
  }

  async getTicketsByEmail(email: string) {
    const { data, error } = await this.client
      .from('tickets')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tickets by email:', error);
      return [];
    }
    return data;
  }

  async addReply(ticketId: string | number, replyData: any) {
    let ticketNumber = ticketId;
    
    // Logic to ensure we use ticket_number string, not internal ID
    if (!isNaN(Number(ticketId))) {
      const { data: ticket } = await this.client
        .from('tickets')
        .select('ticket_number')
        .eq('id', ticketId)
        .single();
      if (ticket) ticketNumber = ticket.ticket_number;
    }

    const { data, error } = await this.client
      .from('ticket_replies')
      .insert([{
        ticket_id: ticketNumber,
        author_type: replyData.authorType,
        author_name: replyData.authorName,
        message: replyData.message
      }])
      .select();

    if (error) {
      console.error('Error adding reply to Supabase:', error);
      throw error;
    }

    // Update ticket's updated_at
    await this.client
      .from('tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('ticket_number', ticketNumber);

    return data[0].id;
  }

  async getReplies(ticketNumber: string) {
    const { data, error } = await this.client
      .from('ticket_replies')
      .select('*')
      .eq('ticket_id', ticketNumber)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching replies:', error);
      return [];
    }
    return data;
  }

  // --- Payment Methods ---
  async transactionExists(transactionId: string) {
    const { data, error } = await this.client
      .from('payments')
      .select('transaction_id')
      .eq('transaction_id', transactionId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking transaction:', error);
    }
    return !!data;
  }
  
  async savePayment(paymentData: any) {
    const { data, error } = await this.client
      .from('payments')
      .insert([{
        transaction_id: paymentData.transactionId,
        payer_email: paymentData.payerEmail,
        payer_id: paymentData.payerId || null,
        roblox_username: paymentData.robloxUsername || null,
        roblox_uaid: paymentData.robloxUaid || null,
        tier: paymentData.tier,
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_status: paymentData.status,
        generated_keys: paymentData.keys ? JSON.stringify(paymentData.keys) : null,
        updated_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('Error saving payment to Supabase:', error);
      throw error;
    }

    if (paymentData.keys && paymentData.keys.length > 0) {
      await this.saveKeys(paymentData.transactionId, paymentData.keys);
    }

    return data[0].id;
  }

  async saveKeys(transactionId: string, keys: string[]) {
    const rows = keys.map(key => ({
      transaction_id: transactionId,
      key_value: key,
      status: 'active'
    }));

    const { error } = await this.client.from('license_keys').insert(rows);

    if (error) console.error('Error saving keys:', error);
    else console.log(`Saved ${keys.length} keys`);
  }
  
  async updatePaymentKeys(transactionId: string, keys: string[]) {
    // Update legacy column
    await this.client
      .from('payments')
      .update({ 
        generated_keys: JSON.stringify(keys), // Legacy
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId);

    // Insert into new table
    await this.saveKeys(transactionId, keys);
  }

  async updateRobloxPurchase(transactionId: string, uaid: number) {
    const { error } = await this.client
      .from('payments')
      .update({ 
        roblox_uaid: uaid,
        created_at: new Date().toISOString(), // Reset creation time for renewal
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId);

    if (error) {
      console.error('Error updating roblox purchase:', error);
      return false;
    }
    return true;
  }

  async updateGameSelection(transactionId: string, games: string[]) {
    const { error } = await this.client
      .from('payments')
      .update({
        game_selection: games,
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', transactionId);

    if (error) {
      console.error('Error updating game selection:', error);
      return false;
    }
    return true;
  }
  
  async getPayment(transactionId: string) {
    const { data: payment, error } = await this.client
      .from('payments')
      .select('*, license_keys(key_value)')
      .eq('transaction_id', transactionId)
      .single();

    if (error && error.code !== 'PGRST116') console.error('Error fetching payment:', error);

    if (payment) {
        // Normalize keys
        if (payment.license_keys?.length) {
            payment.generated_keys = payment.license_keys.map((k: any) => k.key_value);
        } else if (typeof payment.generated_keys === 'string') {
            try { payment.generated_keys = JSON.parse(payment.generated_keys); } catch {}
        }
    }
    return payment;
  }
  
  async getAllPayments() {
    const { data, error } = await this.client
      .from('payments')
      .select('*, license_keys(key_value)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all payments:', error);
      return [];
    }
    
    return data.map((payment: any) => {
        if (payment.license_keys?.length) {
            payment.generated_keys = payment.license_keys.map((k: any) => k.key_value);
        } else if (typeof payment.generated_keys === 'string') {
            try { payment.generated_keys = JSON.parse(payment.generated_keys); } catch { payment.generated_keys = [payment.generated_keys]; }
        }
        return payment;
    });
  }

  async getUserPayments(email: string) {
    const { data, error } = await this.client
      .from('payments')
      .select('*, license_keys(key_value)')
      .eq('payer_email', email)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user payments:', error);
      return [];
    }

    return data.map((payment: any) => {
        if (payment.license_keys?.length) {
            payment.generated_keys = payment.license_keys.map((k: any) => k.key_value);
        } else if (typeof payment.generated_keys === 'string') {
            try { payment.generated_keys = JSON.parse(payment.generated_keys); } catch { payment.generated_keys = [payment.generated_keys]; }
        }
        return payment;
    });
  }

  async getPurchaseCount() {
    const { count, error } = await this.client
      .from('payments')
      .select('*', { count: 'exact', head: true }); // Head request for count only

    if (error) {
      console.error('Error fetching purchase count:', error);
      return 0;
    }
    return count || 0;
  }

  // --- Premium Stock Methods ---
  private normalizeTier(tier: string) {
    const normalized = (tier || '').toLowerCase();
    return this.premiumTiers.includes(normalized) ? normalized : null;
  }

  private async ensurePremiumStockRows() {
    const { data, error } = await this.client
      .from('premium_stock')
      .select('tier');

    if (error) {
      console.error('Error reading premium stock rows:', error);
      return;
    }

    const existing = new Set((data || []).map((row: any) => row.tier));
    const missing = this.premiumTiers
      .filter((tier) => !existing.has(tier))
      .map((tier) => ({ tier, stock: 100 }));

    if (missing.length > 0) {
      const { error: insertError } = await this.client
        .from('premium_stock')
        .insert(missing);

      if (insertError) {
        console.error('Error creating default premium stock rows:', insertError);
      }
    }
  }

  async getPremiumStocks(): Promise<Record<string, number>> {
    await this.ensurePremiumStockRows();

    const fallback = { weekly: 0, monthly: 0, lifetime: 0 };

    const { data, error } = await this.client
      .from('premium_stock')
      .select('tier, stock');

    if (error) {
      console.error('Error fetching premium stocks:', error);
      return fallback;
    }

    const map = { ...fallback };
    for (const row of data || []) {
      if (this.premiumTiers.includes(row.tier)) {
        map[row.tier as 'weekly' | 'monthly' | 'lifetime'] = Number(row.stock || 0);
      }
    }

    return map;
  }

  async getPremiumStock(tier: string): Promise<number> {
    const normalizedTier = this.normalizeTier(tier);
    if (!normalizedTier) return 0;

    await this.ensurePremiumStockRows();

    const { data, error } = await this.client
      .from('premium_stock')
      .select('stock')
      .eq('tier', normalizedTier)
      .single();

    if (error) {
      console.error('Error fetching premium stock for tier:', normalizedTier, error);
      return 0;
    }

    return Number(data?.stock || 0);
  }

  async setPremiumStock(tier: string, stock: number) {
    const normalizedTier = this.normalizeTier(tier);
    if (!normalizedTier) {
      throw new Error('Invalid tier');
    }

    const safeStock = Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;

    const { data, error } = await this.client
      .from('premium_stock')
      .upsert({
        tier: normalizedTier,
        stock: safeStock,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tier' })
      .select('tier, stock')
      .single();

    if (error) {
      console.error('Error setting premium stock:', error);
      throw error;
    }

    return data;
  }

  async decrementPremiumStock(tier: string): Promise<boolean> {
    const normalizedTier = this.normalizeTier(tier);
    if (!normalizedTier) return false;

    await this.ensurePremiumStockRows();

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: current, error: readError } = await this.client
        .from('premium_stock')
        .select('stock')
        .eq('tier', normalizedTier)
        .single();

      if (readError) {
        console.error('Error reading stock before decrement:', readError);
        return false;
      }

      const currentStock = Number(current?.stock || 0);
      if (currentStock <= 0) {
        return false;
      }

      const { data: updated, error: updateError } = await this.client
        .from('premium_stock')
        .update({
          stock: currentStock - 1,
          updated_at: new Date().toISOString()
        })
        .eq('tier', normalizedTier)
        .eq('stock', currentStock)
        .select('tier')
        .maybeSingle();

      if (updateError) {
        console.error('Error decrementing premium stock:', updateError);
        return false;
      }

      if (updated) {
        return true;
      }
    }

    return false;
  }

  // --- Visitor Stats ---
  async getVisitorStats() {
    // We now use a single 'global_counter' row for all stats
    // But we might want to respect legacy data if we want.
    // For simplicity and per request "remove unique", we will just read the global counter 
    // OR sum everything if we want to include legacy counts + new global count.
    
    // Simplest: Sum everything, as 'global_counter' will just be a large entry.
    const { data, error } = await this.client.from('visitors').select('visit_count');
    if (error) return { totalVisits: 0, uniqueVisitors: 0 };
    
    const totalVisits = data.reduce((sum: number, v: any) => sum + v.visit_count, 0);
    return {
        totalVisits,
        uniqueVisitors: 0, // Removed per request
        lastUpdated: new Date().toISOString()
    };
  }

  // --- Admin Auth ---
  async validateAdminPassword(previewPassword: string): Promise<boolean> {
    if (!previewPassword) return false;

    try {
        // Table: admin_credentials
        // Columns: password (text)
        const { data, error } = await this.client
            .from('admin_credentials')
            .select('password')
            .single();
        
        console.log('🔍 Admin Auth Debug:', { 
            foundData: !!data, 
            hasError: !!error, 
            errorMsg: error?.message,
            inputLen: previewPassword.length,
            dbPassLen: data?.password?.length
        });

        if (!error && data) {
            const match = previewPassword === data.password;
            console.log('🔍 Password Match Result:', match);
            return match;
        }
    } catch (e: any) {
        console.error('⚠️ Admin Auth Exception:', e.message);
    }

    // Fallback to Environment Variable
    const envMatch = previewPassword === process.env.ADMIN_PASSWORD;
    console.log('🔍 fallback Env Match:', envMatch);
    return envMatch;
  }

  async recordVisit(ipAddress: string, userAgent: string) {
    // IGNORE IP -> Use 'global_counter' equivalent
    // usage of '0.0.0.0' fits IP constraints if any
    const GLOBAL_ID = '0.0.0.0'; 

    const { data: existing } = await this.client
        .from('visitors')
        .select('*')
        .eq('ip', GLOBAL_ID)
        .single();
    
    if (existing) {
        await this.client
            .from('visitors')
            .update({
                last_visit: new Date().toISOString(),
                visit_count: existing.visit_count + 1,
                user_agent: 'Global Counter'
            })
            .eq('ip', GLOBAL_ID);
    } else {
        await this.client
            .from('visitors')
            .insert([{
                ip: GLOBAL_ID,
                user_agent: 'Global Counter',
                visit_count: 1
            }]);
    }

    return await this.getVisitorStats();
  }

  // --- Ticket Methods ---
  async updateStatus(ticketId: string | number, status: string) {
    const query = !isNaN(Number(ticketId))
        ? this.client.from('tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticketId)
        : this.client.from('tickets').update({ status, updated_at: new Date().toISOString() }).eq('ticket_number', ticketId);
        
    const { error } = await query;
    if (error) {
      console.error('Error updating ticket status:', error);
      throw error;
    }
  }
  // --- Auth & Verification ---
  async checkUserExists(email: string) {
    // Check if this email has ever made a successful payment
    const { data, error } = await this.client
        .from('payments')
        .select('id')
        .eq('payer_email', email)
        .eq('payment_status', 'COMPLETED')
        .limit(1);
    
    if (error) {
        console.error('Error checking user existence:', error);
        return false;
    }
    return data && data.length > 0;
  }

  async createVerificationCode(email: string, code: string) {
    // Expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error } = await this.client
        .from('verification_codes')
        .upsert({ 
            email, 
            code, 
            expires_at: expiresAt 
        }, { onConflict: 'email' });

    if (error) {
        console.error('Error creating verification code:', error);
        throw error;
    }
    return true;
  }

  async verifyCode(email: string, code: string) {
    const { data, error } = await this.client
        .from('verification_codes')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !data) {
        return { success: false, error: 'Code not found' };
    }

    if (new Date(data.expires_at) < new Date()) {
        return { success: false, error: 'Code expired' };
    }

    if (data.code !== code) {
        return { success: false, error: 'Invalid code' };
    }

    // Success! Delete the code so it can't be reused
    await this.client.from('verification_codes').delete().eq('email', email);
    
    return { success: true };
  }
}

export const db = new TicketDatabase();
