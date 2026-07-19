// api/verify-payment.js
// Vercel Serverless Function - checks Stripe session status

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return res.status(200).json({
      paid: session.payment_status === 'paid',
      customerEmail: session.customer_details?.email,
      amount: session.amount_total / 100,
      product: session.metadata?.product
    });

  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: err.message });
  }
};
