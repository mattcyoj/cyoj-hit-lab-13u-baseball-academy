const Stripe = require('stripe');

const STRIPE_API_VERSION = '2026-07-29.dahlia';

const TEAM_NAME = '13U Baseball Academy';
const TEAM_CODE = '13U_BASEBALL_ACADEMY';
const SEASON = '2027';

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  /*
   * Required server configuration.
   *
   * We intentionally use a separate 13U Stripe Price ID
   * instead of reusing the 14U Yeaney price.
   */
  const stripeSecretKey =
    process.env.STRIPE_SECRET_KEY;

  const initialPriceId =
    process.env.STRIPE_13U_INITIAL_PRICE_ID;

  const siteUrl = String(
    process.env.SITE_URL || DEFAULT_SITE_URL
  ).replace(/\/+$/, '');

  if (!stripeSecretKey) {
    return res.status(500).json({
      error: 'Stripe is not configured',
    });
  }

  if (!initialPriceId) {
    return res.status(500).json({
      error:
        '13U Stripe initial-payment price is not configured',
    });
  }

  const stripe = new Stripe(
    stripeSecretKey,
    {
      apiVersion: STRIPE_API_VERSION,
    }
  );

  const {
    guardianAuthorized,
    installmentTermsAccepted,
    agreementVersion,
    attemptId,
  } = req.body || {};

  if (
    guardianAuthorized !== true ||
    installmentTermsAccepted !== true
  ) {
    return res.status(400).json({
      error:
        'Required authorization was not confirmed',
    });
  }

  const acceptedAt =
    new Date().toISOString();

  const safeAttemptId =
    String(attemptId || '')
      .replace(
        /[^a-zA-Z0-9_-]/g,
        ''
      )
      .slice(0, 100) ||
    `server-${Date.now()}`;

  /*
   * All metadata is intentionally 13U-specific.
   *
   * These fields will also give the webhook
   * reliable identifiers for:
   *
   * - payment notifications
   * - installment processing
   * - membership enrollment
   * - QR membership-card creation
   */
  const metadata = {
    program:
      'CYOJ Hit Lab 2027 Baseball Academy',

    team:
      TEAM_NAME,

    team_code:
      TEAM_CODE,

    season:
      SEASON,

    payment_option:
      'installment',

    team_package_total:
      '1995.00',

    installment_1_amount:
      '1000.00',

    installment_1_timing:
      'initial_checkout',

    installment_2_amount:
      '500.00',

    installment_2_due:
      '2026-11-01',

    installment_3_amount:
      '495.00',

    installment_3_due:
      '2027-02-01',

    guardian_authorized:
      'true',

    future_off_session_authorized:
      'true',

    agreement_version:
      String(
        agreementVersion ||
          '2026-08-31-13u-v1'
      ).slice(0, 500),

    agreement_accepted_at:
      acceptedAt,

    checkout_attempt_id:
      safeAttemptId,

    membership_program:
      'CYOJ Hit Lab 13U Baseball Academy',

    membership_card_required:
      'true',

    membership_team:
      TEAM_NAME,
  };

  try {
    const session =
      await stripe.checkout.sessions.create(
        {
          mode: 'payment',

          client_reference_id:
            `${TEAM_CODE}-${safeAttemptId}`,

          line_items: [
            {
              price: initialPriceId,
              quantity: 1,
            },
          ],

          customer_creation:
            'always',

          phone_number_collection: {
            enabled: true,
          },

          custom_fields: [
            {
              key:
                'parent_guardian_name',

              label: {
                type: 'custom',
                custom:
                  'Parent or guardian name',
              },

              type: 'text',

              optional: false,
            },

            {
              key:
                'player_name',

              label: {
                type: 'custom',
                custom:
                  'Player name',
              },

              type: 'text',

              optional: false,
            },
          ],

          /*
           * Save the payment method used for
           * the initial $1,000 payment so the
           * scheduled $500 and $495 installments
           * can later be processed off-session.
           */
          payment_intent_data: {
            setup_future_usage:
              'off_session',

            metadata,
          },

          /*
           * Invoice metadata gives us another
           * reliable 13U identifier in Stripe.
           */
          invoice_creation: {
            enabled: true,

            invoice_data: {
              metadata,
            },
          },

          metadata,

          success_url:
            `${siteUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}#payment`,

          cancel_url:
            `${siteUrl}/?payment=cancelled#payment`,
        },

        {
          /*
           * Completely separate idempotency namespace
           * from the 14U Yeaney checkout.
           */
          idempotencyKey:
            `cyoj-13u-installment-${safeAttemptId}`,
        }
      );

    return res
      .status(200)
      .json({
        url: session.url,
      });
  } catch (error) {
    console.error(
      '13U Stripe checkout session creation failed',
      {
        type:
          error.type,

        code:
          error.code,

        requestId:
          error.requestId,

        message:
          error.message,
      }
    );

    return res.status(500).json({
      error:
        'Unable to create secure 13U checkout',
    });
  }
};
