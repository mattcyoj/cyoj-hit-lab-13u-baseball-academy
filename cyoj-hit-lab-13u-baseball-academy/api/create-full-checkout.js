const Stripe = require('stripe');

const STRIPE_API_VERSION =
  '2026-07-29.dahlia';

const TEAM_NAME =
  '13U Baseball Academy';

const TEAM_CODE =
  '13U_BASEBALL_ACADEMY';

const SEASON =
  '2027';

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';


module.exports =
  async function handler(
    req,
    res
  ) {
    if (
      req.method !== 'POST'
    ) {
      res.setHeader(
        'Allow',
        'POST'
      );

      return res
        .status(405)
        .json({
          error:
            'Method not allowed',
        });
    }


    const stripeSecretKey =
      process.env
        .STRIPE_SECRET_KEY;

    const fullPriceId =
      process.env
        .STRIPE_13U_FULL_PRICE_ID;

    const siteUrl =
      String(
        process.env.SITE_URL ||
        DEFAULT_SITE_URL
      ).replace(
        /\/+$/,
        ''
      );


    if (!stripeSecretKey) {
      return res
        .status(500)
        .json({
          error:
            'Stripe is not configured',
        });
    }


    if (!fullPriceId) {
      return res
        .status(500)
        .json({
          error:
            '13U pay-in-full Stripe price is not configured',
        });
    }


    const stripe =
      new Stripe(
        stripeSecretKey,
        {
          apiVersion:
            STRIPE_API_VERSION,
        }
      );


    const {
      guardianAuthorized,
      installmentTermsAccepted,
      agreementVersion,
      attemptId,
    } = req.body || {};


    /*
     * We use the same two website
     * authorization checkboxes for
     * both payment choices.
     */
    if (
      guardianAuthorized !== true ||
      installmentTermsAccepted !== true
    ) {
      return res
        .status(400)
        .json({
          error:
            'Required authorization was not confirmed',
        });
    }


    const acceptedAt =
      new Date()
        .toISOString();


    const safeAttemptId =
      String(
        attemptId || ''
      )
        .replace(
          /[^a-zA-Z0-9_-]/g,
          ''
        )
        .slice(
          0,
          100
        ) ||
      `server-${Date.now()}`;


    /*
     * All Stripe metadata is
     * intentionally 13U-specific.
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
        'pay_in_full',

      team_package_total:
        '1995.00',

      amount_due:
        '1995.00',

      guardian_authorized:
        'true',

      future_off_session_authorized:
        'false',

      agreement_version:
        String(
          agreementVersion ||
          '2026-08-31-13u-v1'
        ).slice(
          0,
          500
        ),

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
        await stripe
          .checkout
          .sessions
          .create(
            {
              mode:
                'payment',

              client_reference_id:
                `${TEAM_CODE}-FULL-${safeAttemptId}`,

              line_items: [
                {
                  price:
                    fullPriceId,

                  quantity:
                    1,
                },
              ],

              customer_creation:
                'always',

              phone_number_collection: {
                enabled:
                  true,
              },

              custom_fields: [
                {
                  key:
                    'parent_guardian_name',

                  label: {
                    type:
                      'custom',

                    custom:
                      'Parent or guardian name',
                  },

                  type:
                    'text',

                  optional:
                    false,
                },

                {
                  key:
                    'player_name',

                  label: {
                    type:
                      'custom',

                    custom:
                      'Player name',
                  },

                  type:
                    'text',

                  optional:
                    false,
                },
              ],


              /*
               * No future payment-method
               * authorization is required
               * for Pay in Full.
               */
              payment_intent_data: {
                metadata,
              },


              invoice_creation: {
                enabled:
                  true,

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
               * Separate namespace from
               * installment checkout and
               * completely separate from
               * the 14U Yeaney system.
               */
              idempotencyKey:
                `cyoj-13u-full-${safeAttemptId}`,
            }
          );


      return res
        .status(200)
        .json({
          url:
            session.url,
        });

    } catch (error) {
      console.error(
        '13U pay-in-full Stripe checkout creation failed',
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


      return res
        .status(500)
        .json({
          error:
            'Unable to create secure 13U pay-in-full checkout',
        });
    }
  };
