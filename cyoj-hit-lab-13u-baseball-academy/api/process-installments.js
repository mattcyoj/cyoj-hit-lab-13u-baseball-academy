import Stripe from 'stripe';

const STRIPE_API_VERSION =
  '2026-07-29.dahlia';

const PROGRAM =
  'CYOJ Hit Lab 2027 Baseball Academy';

const TEAM =
  '13U Baseball Academy';

const TEAM_CODE =
  '13U_BASEBALL_ACADEMY';

const TIME_ZONE =
  'America/Los_Angeles';


const INSTALLMENTS = [
  {
    key: 'installment_2',

    amount: 75000,

    dueDate: '2026-11-01',

    description:
      '2027 CYOJ Hit Lab Baseball Academy — 13U Baseball Academy — November 1, 2026 installment',
  },

  {
    key: 'installment_3',

    amount: 75000,

    dueDate: '2027-02-01',

    description:
      '2027 CYOJ Hit Lab Baseball Academy — 13U Baseball Academy — February 1, 2027 installment',
  },
];


function getStripe() {
  return new Stripe(
    process.env.STRIPE_SECRET_KEY,
    {
      apiVersion:
        STRIPE_API_VERSION,
    }
  );
}


function getPacificDate() {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          TIME_ZONE,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      }
    ).formatToParts(
      new Date()
    );

  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            [
              'year',
              'month',
              'day',
            ].includes(
              part.type
            )
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ]
        )
    );

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}


function authorizedRequest(req) {
  const auth =
    req.headers.authorization;

  return (
    process.env.CRON_SECRET &&
    auth ===
      `Bearer ${process.env.CRON_SECRET}`
  );
}


function customerIsEligible(customer) {
  const metadata =
    customer.metadata || {};

  return (
    metadata.program === PROGRAM &&
    metadata.team === TEAM &&
    metadata.team_code ===
      TEAM_CODE &&
    metadata.payment_option ===
      'installment' &&
    metadata.guardian_authorized ===
      'true' &&
    metadata.future_off_session_authorized ===
      'true' &&
    metadata.initial_payment_status ===
      'paid' &&
    [
      'initial_payment_received',
      'installment_2_paid',
    ].includes(
      metadata.enrollment_status
    )
  );
}


async function getEligibleCustomers(
  stripe
) {
  const customers = [];
  let page;

  do {
    const result =
      await stripe.customers.search({
        query:
          `metadata['program']:'${PROGRAM}' AND ` +
          `metadata['team']:'${TEAM}' AND ` +
          `metadata['payment_option']:'installment'`,

        limit: 100,

        ...(page
          ? { page }
          : {}),
      });

    customers.push(
      ...result.data.filter(
        customerIsEligible
      )
    );

    page =
      result.has_more
        ? result.next_page
        : null;

  } while (page);

  return customers;
}


function buildScheduleKey(
  customerId,
  installment
) {
  return [
    'cyoj13u',
    customerId,
    installment.key,
    installment.dueDate,
  ].join('-');
}


async function findExistingInvoice(
  stripe,
  scheduleKey
) {
  const result =
    await stripe.invoices.search({
      query:
        `metadata['installment_schedule_key']:` +
        `'${scheduleKey}'`,

      limit: 1,
    });

  return (
    result.data[0] ||
    null
  );
}


async function ensureInvoiceItem(
  stripe,
  invoice,
  customer,
  installment,
  scheduleKey
) {
  const existingItems =
    await stripe.invoiceItems.list({
      invoice:
        invoice.id,

      limit:
        100,
    });

  const existingItem =
    existingItems.data.find(
      (item) =>
        item.metadata
          ?.installment_schedule_key ===
        scheduleKey
    );

  if (existingItem) {
    return existingItem;
  }

  return stripe.invoiceItems.create(
    {
      customer:
        customer.id,

      invoice:
        invoice.id,

      amount:
        installment.amount,

      currency:
        'usd',

      description:
        installment.description,

      metadata: {
        program:
          PROGRAM,

        team:
          TEAM,

        team_code:
          TEAM_CODE,

        payment_option:
          'installment',

        installment_key:
          installment.key,

        scheduled_due_date:
          installment.dueDate,

        scheduled_amount:
          (
            installment.amount /
            100
          ).toFixed(2),

        installment_schedule_key:
          scheduleKey,

        player_name:
          customer.metadata
            ?.player_name ||
          '',
      },
    },

    {
      idempotencyKey:
        `${scheduleKey}-invoice-item`,
    }
  );
}


async function processInstallment(
  stripe,
  customer,
  installment
) {
  /*
   * STRICT PAYMENT ORDER
   *
   * November requires the initial
   * $1,000 payment to be confirmed.
   *
   * February requires November's
   * $750 payment to be confirmed.
   */
  const requiredEnrollmentStatus =
    installment.key ===
    'installment_2'
      ? 'initial_payment_received'
      : 'installment_2_paid';


  if (
    customer.metadata
      ?.enrollment_status !==
    requiredEnrollmentStatus
  ) {
    return {
      customer:
        customer.id,

      player:
        customer.metadata
          ?.player_name ||
        '',

      installment:
        installment.key,

      action:
        'skipped',

      reason:
        'prior_installment_not_confirmed_paid',
    };
  }


  /*
   * Neither future installment may
   * process unless Stripe recorded
   * the initial $1,000 as paid.
   */
  if (
    customer.metadata
      ?.initial_payment_status !==
    'paid'
  ) {
    return {
      customer:
        customer.id,

      player:
        customer.metadata
          ?.player_name ||
        '',

      installment:
        installment.key,

      action:
        'skipped',

      reason:
        'initial_payment_not_confirmed_paid',
    };
  }


  /*
   * Additional February safeguard:
   * November must explicitly show paid.
   */
  if (
    installment.key ===
      'installment_3' &&
    customer.metadata
      ?.installment_2_payment_status !==
      'paid'
  ) {
    return {
      customer:
        customer.id,

      player:
        customer.metadata
          ?.player_name ||
        '',

      installment:
        installment.key,

      action:
        'skipped',

      reason:
        'november_installment_not_confirmed_paid',
    };
  }


  const scheduleKey =
    buildScheduleKey(
      customer.id,
      installment
    );


  let invoice =
    await findExistingInvoice(
      stripe,
      scheduleKey
    );


  /*
   * Prevent duplicate invoices /
   * duplicate installment charges.
   */
  if (
    invoice &&
    [
      'open',
      'paid',
      'void',
      'uncollectible',
    ].includes(
      invoice.status
    )
  ) {
    return {
      customer:
        customer.id,

      player:
        customer.metadata
          ?.player_name ||
        '',

      installment:
        installment.key,

      invoice:
        invoice.id,

      status:
        invoice.status,

      action:
        'already_exists',
    };
  }


  const defaultPaymentMethod =
    customer.invoice_settings
      ?.default_payment_method;


  if (!defaultPaymentMethod) {
    return {
      customer:
        customer.id,

      player:
        customer.metadata
          ?.player_name ||
        '',

      installment:
        installment.key,

      action:
        'skipped',

      reason:
        'no_default_payment_method',
    };
  }


  if (!invoice) {
    invoice =
      await stripe.invoices.create(
        {
          customer:
            customer.id,

          collection_method:
            'charge_automatically',

          auto_advance:
            false,

          automatic_tax: {
            enabled:
              false,
          },

          default_payment_method:
            defaultPaymentMethod,

          description:
            installment.description,

          custom_fields: [
            {
              name:
                'Player',

              value:
                customer.metadata
                  ?.player_name ||
                '13U Baseball Academy athlete',
            },

            {
              name:
                'Team',

              value:
                TEAM,
            },

            {
              name:
                'Installment',

              value:
                installment.dueDate,
            },
          ],

          metadata: {
            program:
              PROGRAM,

            team:
              TEAM,

            team_code:
              TEAM_CODE,

            payment_option:
              'installment',

            installment_key:
              installment.key,

            scheduled_due_date:
              installment.dueDate,

            scheduled_amount:
              (
                installment.amount /
                100
              ).toFixed(2),

            installment_schedule_key:
              scheduleKey,

            player_name:
              customer.metadata
                ?.player_name ||
              '',

            parent_guardian_name:
              customer.metadata
                ?.parent_guardian_name ||
              '',

            initial_checkout_session_id:
              customer.metadata
                ?.initial_checkout_session_id ||
              '',

            initial_payment_status:
              customer.metadata
                ?.initial_payment_status ||
              '',

            future_off_session_authorized:
              'true',
          },
        },

        {
          idempotencyKey:
            `${scheduleKey}-invoice`,
        }
      );
  }


  /*
   * Add exactly one installment line
   * and finalize the invoice.
   *
   * Stripe then uses the securely
   * saved default payment method.
   */
  if (
    invoice.status ===
    'draft'
  ) {
    await ensureInvoiceItem(
      stripe,
      invoice,
      customer,
      installment,
      scheduleKey
    );

    invoice =
      await stripe.invoices
        .finalizeInvoice(
          invoice.id,

          {
            auto_advance:
              true,
          },

          {
            idempotencyKey:
              `${scheduleKey}-finalize`,
          }
        );
  }


  return {
    customer:
      customer.id,

    player:
      customer.metadata
        ?.player_name ||
      '',

    installment:
      installment.key,

    invoice:
      invoice.id,

    status:
      invoice.status,

    action:
      'processed',
  };
}


export default async function handler(
  req,
  res
) {
  if (
    req.method !== 'GET'
  ) {
    res.setHeader(
      'Allow',
      'GET'
    );

    return res
      .status(405)
      .json({
        error:
          'Method not allowed',
      });
  }


  if (
    !authorizedRequest(req)
  ) {
    return res
      .status(401)
      .json({
        error:
          'Unauthorized',
      });
  }


  if (
    !process.env
      .STRIPE_SECRET_KEY
  ) {
    return res
      .status(500)
      .json({
        error:
          'Stripe is not configured',
      });
  }


  const stripe =
    getStripe();

  const today =
    getPacificDate();


  try {
    const dueInstallments =
      INSTALLMENTS.filter(
        (installment) =>
          today >=
          installment.dueDate
      );


    if (
      dueInstallments.length ===
      0
    ) {
      return res
        .status(200)
        .json({
          ok:
            true,

          team:
            TEAM,

          date:
            today,

          message:
            'No 13U Baseball Academy installments are due.',

          processed:
            [],
        });
    }


    const customers =
      await getEligibleCustomers(
        stripe
      );


    const processed = [];


    for (
      const customer
      of customers
    ) {
      for (
        const installment
        of dueInstallments
      ) {
        const result =
          await processInstallment(
            stripe,
            customer,
            installment
          );

        processed.push(
          result
        );
      }
    }


    return res
      .status(200)
      .json({
        ok:
          true,

        team:
          TEAM,

        date:
          today,

        eligibleCustomers:
          customers.length,

        processed,
      });

  } catch (error) {
    console.error(
      '13U Baseball Academy installment processing failed',
      {
        message:
          error.message,

        type:
          error.type,

        code:
          error.code,

        requestId:
          error.requestId,
      }
    );


    return res
      .status(500)
      .json({
        error:
          '13U installment processing failed',
      });
  }
}
