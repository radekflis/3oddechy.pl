// api/create-payment.js
// Vercel Serverless Function - creates a Stripe Checkout session
// Supports BLIK, card, Przelewy24 (all popular Polish payment methods)

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia'
    });

    const { customerName, customerEmail, product } = req.body;
    // product = 'analysis' (50zł) or 'letter' (490zł)

    const products = {
      analysis: { name: 'Analiza Statystycznej Maszyny Restytucji', price: 5000 }, // 50 zł in grosze
      letter: { name: 'Pismo do agresora od naszego prawnika', price: 49000 }      // 490 zł in grosze
    };

    const p = products[product] || products.analysis;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'blik', 'p24'],
      line_items: [{
        price_data: {
          currency: 'pln',
          product_data: {
            name: p.name,
            description: 'Restytucja Rzeczywistości - ' + p.name
          },
          unit_amount: p.price
        },
        quantity: 1
      }],
      mode: 'payment',
      customer_email: customerEmail,
      metadata: {
        customerName: customerName || 'anonim',
        product: product
      },
      success_url: `${req.headers.origin}/sukces?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/#form`,
      locale: 'pl'
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (err) {
    console.error('Payment error:', err);
    return res.status(500).json({ error: err.message });
  }
};
