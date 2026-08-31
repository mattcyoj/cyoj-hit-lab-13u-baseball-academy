const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-07-29.dahlia',
});

const INITIAL_PRICE_ID = 'price_1U8PrLHlIpQ8bVPoFtvYvZLr';
const SITE_URL = 'https://cyoj-hit-lab-14u-yeaney.vercel.app';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe is not configured' });
  }

  const { guardianAuthorized, installmentTermsAccepted, agreementVersion, attemptId } = req.body || {};
  if (guardianAuthorized !== true || installmentTermsAccepted !== true) {
    return res.status(400).json({ error: 'Required authorization was not confirmed' });
  }

  const acceptedAt = new Date().toISOString();
  const safeAttemptId = String(attemptId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100) || `server-${Date.now()}`;
  const metadata = {
    program: 'CYOJ Hit Lab 2027 Baseball Academy',
    team: '14U Yeaney',
    coach: 'Alex Yeaney',
    payment_option: 'installment',
    installment_1_amount: '1000.00',
    installment_1_timing: 'initial_checkout',
    installment_2_amount: '500.00',
    installment_2_due: '2026-11-01',
    installment_3_amount: '495.00',
    installment_3_due: '2027-02-01',
    guardian_authorized: 'true',
    future_off_session_authorized: 'true',
    agreement_version: String(agreementVersion || '2026-08-25-v1').slice(0, 500),
    agreement_accepted_at: acceptedAt,
    checkout_attempt_id: safeAttemptId,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: INITIAL_PRICE_ID, quantity: 1 }],
      customer_creation: 'always',
      phone_number_collection: { enabled: true },
      custom_fields: [
        {
          key: 'parent_guardian_name',
          label: { type: 'custom', custom: 'Parent or guardian name' },
          type: 'text',
          optional: false,
        },
        {
          key: 'player_name',
          label: { type: 'custom', custom: 'Player name' },
          type: 'text',
          optional: false,
        },
      ],
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata,
      },
      invoice_creation: {
        enabled: true,
        invoice_data: { metadata },
      },
      metadata,
      success_url: `${SITE_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}#payment`,
      cancel_url: `${SITE_URL}/?payment=cancelled#payment`,
    }, {
      idempotencyKey: `yeaney14u-installment-${safeAttemptId}`,
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout session creation failed', {
      type: error.type,
      code: error.code,
      requestId: error.requestId,
      message: error.message,
    });
    return res.status(500).json({ error: 'Unable to create secure checkout' });
  }
};
