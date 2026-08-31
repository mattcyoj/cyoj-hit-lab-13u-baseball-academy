import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-07-29.dahlia',
});

const PROGRAM = 'CYOJ Hit Lab 2027 Baseball Academy';
const TEAM = '14U Yeaney';

const NOTIFICATION_TO = 'academyteams@cyojhitlab.com';
const NOTIFICATION_FROM =
  'CYOJ Hit Lab Payments <payments@notifications.cyojhitlabacademy.com>';

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function getId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function getCustomFieldValue(session, key) {
  const field = (session.custom_fields || []).find(
    (item) => item.key === key
  );

  if (!field) return '';

  if (field.type === 'text') {
    return String(field.text?.value || '').trim();
  }

  if (field.type === 'dropdown') {
    return String(field.dropdown?.value || '').trim();
  }

  if (field.type === 'numeric') {
    return String(field.numeric?.value ?? '').trim();
  }

  return '';
}

function isYeaneyCheckout(session) {
  return (
    [
      'CYOJ Hit Lab 2027 Baseball Academy',
      '2027 Baseball Academy',
    ].includes(session.metadata?.program) &&
    session.metadata?.team === TEAM
  );
}

function isYeaneyInstallmentCheckout(session) {
  return (
    isYeaneyCheckout(session) &&
    session.metadata?.payment_option === 'installment'
  );
}

function isYeaneyScheduledInstallmentInvoice(invoice) {
  const metadata = invoice.metadata || {};

  return (
    metadata.program === PROGRAM &&
    metadata.team === TEAM &&
    metadata.payment_option === 'installment' &&
    ['installment_2', 'installment_3'].includes(
      metadata.installment_key
    ) &&
    Boolean(metadata.yeaney_schedule_key)
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatCurrency(amountInCents) {
  const amount = Number(amountInCents || 0) / 100;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatPaymentOption(value) {
  if (value === 'installment') {
    return 'Installment Plan';
  }

  if (
    value === 'pay_in_full' ||
    value === 'pay-in-full' ||
    value === 'full'
  ) {
    return 'Pay in Full';
  }

  return value || 'Team Payment';
}

function formatEventDate(eventCreated) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(eventCreated * 1000));
}

async function sendNotificationEmail({
  subject,
  html,
  text,
  eventId,
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const response = await fetch(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `yeaney-payment/${eventId}`,
      },
      body: JSON.stringify({
        from: NOTIFICATION_FROM,
        to: [NOTIFICATION_TO],
        subject,
        html,
        text,
      }),
    }
  );

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Resend email failed (${response.status}): ${responseBody}`
    );
  }

  console.log('Yeaney payment notification email sent', {
    eventId,
    subject,
  });
}

async function getCustomerContact(customerValue) {
  const customerId = getId(customerValue);

  if (!customerId) {
    return {
      parentGuardianName: '',
      playerName: '',
      email: '',
      phone: '',
    };
  }

  const customer = await stripe.customers.retrieve(customerId);

  if (customer.deleted) {
    return {
      parentGuardianName: '',
      playerName: '',
      email: '',
      phone: '',
    };
  }

  return {
    parentGuardianName:
      customer.metadata?.parent_guardian_name || '',
    playerName:
      customer.metadata?.player_name || '',
    email: customer.email || '',
    phone: customer.phone || '',
  };
}

async function sendCheckoutPaymentNotification(
  session,
  event
) {
  if (!isYeaneyCheckout(session)) return;

const parentGuardianName =
  getCustomFieldValue(
    session,
    'parent_guardian_name'
  ) ||
  session.metadata?.parent_guardian_name ||
  session.customer_details?.name ||
  '';

  const playerName =
    getCustomFieldValue(
      session,
      'player_name'
    ) ||
    session.metadata?.player_name ||
    '';

  const email =
    session.customer_details?.email ||
    session.customer_email ||
    '';

  const phone =
    session.customer_details?.phone ||
    '';

  const paymentOption =
    session.metadata?.payment_option || '';

  const amountPaid =
    session.amount_total ||
    session.amount_subtotal ||
    0;

  const isInstallment =
    paymentOption === 'installment';

  const remainingBalance = isInstallment
    ? 99500
    : 0;

  const nextPayments = isInstallment
    ? '$500 on November 1, 2026; $495 on February 1, 2027'
    : 'None — team fee paid in full';

  const subject =
    `14U Yeaney — Payment Received — ` +
    `${playerName || 'Player'} — ` +
    `${formatCurrency(amountPaid)}`;

  const text = `
CYOJ Hit Lab 14U Yeaney Payment Received

Player: ${playerName || 'Not provided'}
Parent/Guardian: ${parentGuardianName || 'Not provided'}
Email: ${email || 'Not provided'}
Phone: ${phone || 'Not provided'}

Payment Option: ${formatPaymentOption(paymentOption)}
Amount Received: ${formatCurrency(amountPaid)}
Remaining Balance: ${formatCurrency(remainingBalance)}
Upcoming Payments: ${nextPayments}

Stripe Checkout Session: ${session.id}
Stripe Payment Intent: ${getId(session.payment_intent) || 'Not available'}
Payment Received: ${formatEventDate(event.created)}
`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:4px;">14U Yeaney Payment Received</h2>
      <p style="margin-top:0;color:#4b5563;">CYOJ Hit Lab 2027 Baseball Academy</p>

      <table style="width:100%;border-collapse:collapse;margin-top:24px;">
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Player</td>
          <td style="padding:8px 0;">${escapeHtml(playerName || 'Not provided')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Parent/Guardian</td>
          <td style="padding:8px 0;">${escapeHtml(parentGuardianName || 'Not provided')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Email</td>
          <td style="padding:8px 0;">${escapeHtml(email || 'Not provided')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Phone</td>
          <td style="padding:8px 0;">${escapeHtml(phone || 'Not provided')}</td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;" />

      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Payment Option</td>
          <td style="padding:8px 0;">${escapeHtml(formatPaymentOption(paymentOption))}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Amount Received</td>
          <td style="padding:8px 0;font-weight:bold;">${formatCurrency(amountPaid)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Remaining Balance</td>
          <td style="padding:8px 0;">${formatCurrency(remainingBalance)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Upcoming Payments</td>
          <td style="padding:8px 0;">${escapeHtml(nextPayments)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Received</td>
          <td style="padding:8px 0;">${escapeHtml(formatEventDate(event.created))}</td>
        </tr>
      </table>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;" />

      <p style="font-size:12px;color:#6b7280;">
        Checkout Session: ${escapeHtml(session.id)}<br />
        Payment Intent: ${escapeHtml(getId(session.payment_intent) || 'Not available')}
      </p>
    </div>
  `;

  await sendNotificationEmail({
    subject,
    html,
    text,
    eventId: event.id,
  });
}

async function sendInstallmentSuccessNotification(
  invoice,
  event
) {
  if (!isYeaneyScheduledInstallmentInvoice(invoice)) return;

  const contact =
    await getCustomerContact(invoice.customer);

  const installmentKey =
    invoice.metadata.installment_key;

  const installmentLabel =
    installmentKey === 'installment_2'
      ? 'November Installment'
      : 'February Installment';

  const amountPaid =
    invoice.amount_paid ||
    invoice.amount_due ||
    0;

  const remainingBalance =
    installmentKey === 'installment_2'
      ? 49500
      : 0;

  const nextPayment =
    installmentKey === 'installment_2'
      ? '$495 on February 1, 2027'
      : 'None — team fee paid in full';

  const subject =
    `14U Yeaney — ${installmentLabel} Paid — ` +
    `${contact.playerName || 'Player'} — ` +
    `${formatCurrency(amountPaid)}`;

  const text = `
CYOJ Hit Lab 14U Yeaney Installment Payment Received

Player: ${contact.playerName || 'Not provided'}
Parent/Guardian: ${contact.parentGuardianName || 'Not provided'}
Email: ${contact.email || 'Not provided'}
Phone: ${contact.phone || 'Not provided'}

Installment: ${installmentLabel}
Amount Received: ${formatCurrency(amountPaid)}
Remaining Balance: ${formatCurrency(remainingBalance)}
Next Payment: ${nextPayment}

Stripe Invoice: ${invoice.id}
Payment Received: ${formatEventDate(event.created)}
`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
      <h2>${escapeHtml(installmentLabel)} Received</h2>
      <p>CYOJ Hit Lab — 14U Yeaney</p>

      <p><strong>Player:</strong> ${escapeHtml(contact.playerName || 'Not provided')}</p>
      <p><strong>Parent/Guardian:</strong> ${escapeHtml(contact.parentGuardianName || 'Not provided')}</p>
      <p><strong>Email:</strong> ${escapeHtml(contact.email || 'Not provided')}</p>
      <p><strong>Phone:</strong> ${escapeHtml(contact.phone || 'Not provided')}</p>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;" />

      <p><strong>Amount Received:</strong> ${formatCurrency(amountPaid)}</p>
      <p><strong>Remaining Balance:</strong> ${formatCurrency(remainingBalance)}</p>
      <p><strong>Next Payment:</strong> ${escapeHtml(nextPayment)}</p>
      <p><strong>Received:</strong> ${escapeHtml(formatEventDate(event.created))}</p>

      <p style="font-size:12px;color:#6b7280;">
        Stripe Invoice: ${escapeHtml(invoice.id)}
      </p>
    </div>
  `;

  await sendNotificationEmail({
    subject,
    html,
    text,
    eventId: event.id,
  });
}

async function sendInstallmentFailureNotification(
  invoice,
  event
) {
  if (!isYeaneyScheduledInstallmentInvoice(invoice)) return;

  const contact =
    await getCustomerContact(invoice.customer);

  const installmentKey =
    invoice.metadata.installment_key;

  const installmentLabel =
    installmentKey === 'installment_2'
      ? 'November Installment'
      : 'February Installment';

  const amountDue =
    invoice.amount_due ||
    invoice.amount_remaining ||
    0;

  const attemptCount =
    invoice.attempt_count || 1;

  const subject =
    `ACTION REQUIRED — 14U Yeaney Payment Failed — ` +
    `${contact.playerName || 'Player'}`;

  const text = `
CYOJ Hit Lab 14U Yeaney Payment Failed

Player: ${contact.playerName || 'Not provided'}
Parent/Guardian: ${contact.parentGuardianName || 'Not provided'}
Email: ${contact.email || 'Not provided'}
Phone: ${contact.phone || 'Not provided'}

Installment: ${installmentLabel}
Amount Due: ${formatCurrency(amountDue)}
Attempt Count: ${attemptCount}
Status: PAYMENT ATTENTION REQUIRED

Stripe Invoice: ${invoice.id}
Failure Recorded: ${formatEventDate(event.created)}
`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">
      <h2 style="color:#b91c1c;">Payment Attention Required</h2>
      <p><strong>CYOJ Hit Lab — 14U Yeaney</strong></p>

      <p><strong>Player:</strong> ${escapeHtml(contact.playerName || 'Not provided')}</p>
      <p><strong>Parent/Guardian:</strong> ${escapeHtml(contact.parentGuardianName || 'Not provided')}</p>
      <p><strong>Email:</strong> ${escapeHtml(contact.email || 'Not provided')}</p>
      <p><strong>Phone:</strong> ${escapeHtml(contact.phone || 'Not provided')}</p>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;" />

      <p><strong>Failed Installment:</strong> ${escapeHtml(installmentLabel)}</p>
      <p><strong>Amount Due:</strong> ${formatCurrency(amountDue)}</p>
      <p><strong>Attempt Count:</strong> ${escapeHtml(attemptCount)}</p>
      <p><strong>Status:</strong> Payment attention required</p>
      <p><strong>Failure Recorded:</strong> ${escapeHtml(formatEventDate(event.created))}</p>

      <p style="font-size:12px;color:#6b7280;">
        Stripe Invoice: ${escapeHtml(invoice.id)}
      </p>
    </div>
  `;

  await sendNotificationEmail({
    subject,
    html,
    text,
    eventId: event.id,
  });
}

async function recordSuccessfulCheckout(session, eventCreated) {
  if (!isYeaneyInstallmentCheckout(session)) return;

  const customerId = getId(session.customer);
  const paymentIntentId = getId(session.payment_intent);
  const invoiceId = getId(session.invoice);

  if (!customerId || !paymentIntentId) {
    throw new Error(
      `Missing customer or PaymentIntent for Checkout Session ${session.id}`
    );
  }

  const paymentIntent =
    await stripe.paymentIntents.retrieve(paymentIntentId);

  const paymentMethodId = getId(paymentIntent.payment_method);

  if (!paymentMethodId) {
    throw new Error(
      `Missing payment method for PaymentIntent ${paymentIntentId}`
    );
  }

  const parentGuardianName = getCustomFieldValue(
    session,
    'parent_guardian_name'
  );

  const playerName = getCustomFieldValue(
    session,
    'player_name'
  );

  if (!parentGuardianName || !playerName) {
    throw new Error(
      `Required parent/player information missing for Checkout Session ${session.id}`
    );
  }

  const paymentReceivedAt =
    new Date(eventCreated * 1000).toISOString();

  const metadata = {
    ...(session.metadata || {}),
    parent_guardian_name: parentGuardianName,
    player_name: playerName,
    initial_checkout_session_id: session.id,
    initial_payment_intent_id: paymentIntentId,
    initial_payment_status: 'paid',
    initial_payment_received_at: paymentReceivedAt,
    enrollment_status: 'initial_payment_received',
  };

  const updates = [
    stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
      metadata,
    }),

    stripe.paymentIntents.update(paymentIntentId, {
      metadata,
    }),

    stripe.checkout.sessions.update(session.id, {
      metadata,
    }),
  ];

  if (invoiceId) {
    updates.push(
      stripe.invoices.update(invoiceId, {
        metadata,
      })
    );
  }

  await Promise.all(updates);
}

async function recordInstallmentSuccess(invoice, eventCreated) {
  if (!isYeaneyScheduledInstallmentInvoice(invoice)) return;

  const customerId = getId(invoice.customer);

  if (!customerId) {
    throw new Error(
      `Missing customer for Invoice ${invoice.id}`
    );
  }

  const installmentKey = invoice.metadata.installment_key;

  const paymentReceivedAt =
    new Date(eventCreated * 1000).toISOString();

  const enrollmentStatus =
    installmentKey === 'installment_3'
      ? 'paid_in_full'
      : 'installment_2_paid';

  const invoiceMetadata = {
    ...(invoice.metadata || {}),
    installment_payment_status: 'paid',
    installment_payment_received_at: paymentReceivedAt,
  };

  const customerMetadata = {
    [`${installmentKey}_payment_status`]: 'paid',
    [`${installmentKey}_payment_received_at`]:
      paymentReceivedAt,
    [`${installmentKey}_invoice_id`]: invoice.id,
    enrollment_status: enrollmentStatus,
  };

  await Promise.all([
    stripe.invoices.update(invoice.id, {
      metadata: invoiceMetadata,
    }),

    stripe.customers.update(customerId, {
      metadata: customerMetadata,
    }),
  ]);
}

async function recordInstallmentFailure(invoice, eventCreated) {
  if (!isYeaneyScheduledInstallmentInvoice(invoice)) return;

  const customerId = getId(invoice.customer);

  if (!customerId) {
    throw new Error(
      `Missing customer for Invoice ${invoice.id}`
    );
  }

  const installmentKey = invoice.metadata.installment_key;

  const failedAt =
    new Date(eventCreated * 1000).toISOString();

  const attemptCount = String(invoice.attempt_count || 1);

  const invoiceMetadata = {
    ...(invoice.metadata || {}),
    installment_payment_status: 'failed',
    installment_payment_failed_at: failedAt,
    installment_payment_attempt_count: attemptCount,
  };

  const customerMetadata = {
    [`${installmentKey}_payment_status`]: 'failed',
    [`${installmentKey}_payment_failed_at`]: failedAt,
    [`${installmentKey}_invoice_id`]: invoice.id,
    [`${installmentKey}_attempt_count`]: attemptCount,
    enrollment_status: 'payment_attention_required',
  };

  await Promise.all([
    stripe.invoices.update(invoice.id, {
      metadata: invoiceMetadata,
    }),

    stripe.customers.update(customerId, {
      metadata: customerMetadata,
    }),
  ]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  if (
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.STRIPE_WEBHOOK_SECRET
  ) {
    return res.status(500).json({
      error: 'Stripe webhook is not configured',
    });
  }

  const signatureHeader =
    req.headers['stripe-signature'];

  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;

  if (!signature) {
    return res.status(400).json({
      error: 'Missing Stripe signature',
    });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error(
      'Stripe webhook signature verification failed',
      error.message
    );

    return res.status(400).json({
      error: 'Invalid webhook signature',
    });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      if (
        isYeaneyCheckout(session) &&
        session.payment_status === 'paid'
      ) {
        await recordSuccessfulCheckout(
          session,
          event.created
        );

        await sendCheckoutPaymentNotification(
          session,
          event
        );
      }
    }

    if (
      event.type ===
      'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object;

      if (isYeaneyCheckout(session)) {
        await recordSuccessfulCheckout(
          session,
          event.created
        );

        await sendCheckoutPaymentNotification(
          session,
          event
        );
      }
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;

      await recordInstallmentSuccess(
        invoice,
        event.created
      );

      await sendInstallmentSuccessNotification(
        invoice,
        event
      );
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;

      await recordInstallmentFailure(
        invoice,
        event.created
      );

      await sendInstallmentFailureNotification(
        invoice,
        event
      );
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error(
      'Yeaney Stripe webhook processing failed',
      {
        eventId: event.id,
        eventType: event.type,
        message: error.message,
      }
    );

    return res.status(500).json({
      error: 'Webhook processing failed',
    });
  }
}
