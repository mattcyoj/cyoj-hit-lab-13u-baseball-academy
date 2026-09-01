import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: false,
  },
};

const STRIPE_API_VERSION =
  '2026-07-29.dahlia';

const PROGRAM =
  'CYOJ Hit Lab 2027 Baseball Academy';

const TEAM =
  '13U Baseball Academy';

const TEAM_CODE =
  '13U_BASEBALL_ACADEMY';

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';

const NOTIFICATION_TO =
  'support@cyojhitlab.com';

const NOTIFICATION_FROM =
  'CYOJ Hit Lab Payments <payments@notifications.cyojhitlabacademy.com>';

const JOTFORM_FORM_ID =
  '262305529358158';

const WAIVER_URL =
  'https://form.jotform.com/262305529358158';


/* =========================================================
   STRIPE
   ========================================================= */

function getStripe() {
  return new Stripe(
    process.env.STRIPE_SECRET_KEY,
    {
      apiVersion:
        STRIPE_API_VERSION,
    }
  );
}


function getSiteUrl() {
  return String(
    process.env.SITE_URL ||
    DEFAULT_SITE_URL
  ).replace(/\/+$/, '');
}


async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}


function getId(value) {
  if (!value) {
    return null;
  }

  return typeof value === 'string'
    ? value
    : value.id;
}


/* =========================================================
   CHECKOUT FIELD HELPERS
   ========================================================= */

function getCustomFieldValue(
  session,
  key
) {
  const field =
    (session.custom_fields || [])
      .find(
        (item) =>
          item.key === key
      );

  if (!field) {
    return '';
  }

  if (field.type === 'text') {
    return String(
      field.text?.value || ''
    ).trim();
  }

  if (field.type === 'dropdown') {
    return String(
      field.dropdown?.value || ''
    ).trim();
  }

  if (field.type === 'numeric') {
    return String(
      field.numeric?.value ?? ''
    ).trim();
  }

  return '';
}


function getCheckoutContact(
  session
) {
  return {
    parentGuardianName:
      getCustomFieldValue(
        session,
        'parent_guardian_name'
      ) ||
      session.metadata
        ?.parent_guardian_name ||
      session.customer_details
        ?.name ||
      '',

    playerName:
      getCustomFieldValue(
        session,
        'player_name'
      ) ||
      session.metadata
        ?.player_name ||
      '',

    email:
      session.customer_details
        ?.email ||
      session.customer_email ||
      '',

    phone:
      session.customer_details
        ?.phone ||
      '',
  };
}


/* =========================================================
   13U RECORD PROTECTION
   ========================================================= */

function is13UCheckout(session) {
  const metadata =
    session.metadata || {};

  return (
    metadata.team === TEAM &&
    (
      metadata.team_code ===
        TEAM_CODE ||
      metadata.program ===
        PROGRAM
    )
  );
}


function is13UScheduledInstallmentInvoice(
  invoice
) {
  const metadata =
    invoice.metadata || {};

  return (
    metadata.program === PROGRAM &&
    metadata.team === TEAM &&
    metadata.team_code ===
      TEAM_CODE &&
    metadata.payment_option ===
      'installment' &&
    [
      'installment_2',
      'installment_3',
    ].includes(
      metadata.installment_key
    ) &&
    Boolean(
      metadata.installment_schedule_key
    )
  );
}


/* =========================================================
   GENERAL NORMALIZATION
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll(
      '&',
      '&amp;'
    )
    .replaceAll(
      '<',
      '&lt;'
    )
    .replaceAll(
      '>',
      '&gt;'
    )
    .replaceAll(
      '"',
      '&quot;'
    )
    .replaceAll(
      "'",
      '&#039;'
    );
}


function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ''
    );
}


function normalizePhone(value) {
  return String(value || '')
    .replace(
      /\D/g,
      ''
    );
}


function normalizeMetadataValue(
  value
) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


function isWaiverCompletedValue(
  value
) {
  const normalized =
    normalizeMetadataValue(
      value
    );

  return (
    normalized === 'completed' ||
    normalized === 'verified'
  );
}


/* =========================================================
   JOTFORM QUESTION MATCHING
   ========================================================= */

/*
 * Important:
 *
 * We deliberately DO NOT use Jotform
 * numeric question IDs here.
 *
 * The live waiver is matched by the
 * human-readable question text returned
 * with each submission answer.
 */

function normalizeQuestionText(value) {
  return String(value || '')
    .replace(
      /<[^>]*>/g,
      ' '
    )
    .replace(
      /&nbsp;/gi,
      ' '
    )
    .replace(
      /&amp;/gi,
      '&'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toLowerCase();
}


function getSubmissionAnswers(
  submission
) {
  const answers =
    submission?.answers;

  if (
    !answers ||
    typeof answers !== 'object'
  ) {
    return [];
  }

  return Object.values(
    answers
  ).filter(Boolean);
}


function findAnswerByQuestion(
  submission,
  possibleLabels
) {
  const wantedLabels =
    possibleLabels.map(
      normalizeQuestionText
    );

  return (
    getSubmissionAnswers(
      submission
    ).find(
      (answerObject) => {
        const questionText =
          normalizeQuestionText(
            answerObject?.text
          );

        return wantedLabels
          .includes(
            questionText
          );
      }
    ) ||
    null
  );
}


function answerToText(
  answerValue
) {
  if (
    answerValue === null ||
    answerValue === undefined
  ) {
    return '';
  }

  if (
    typeof answerValue === 'string' ||
    typeof answerValue === 'number'
  ) {
    return String(
      answerValue
    ).trim();
  }

  if (
    Array.isArray(
      answerValue
    )
  ) {
    return answerValue
      .map(
        answerToText
      )
      .filter(Boolean)
      .join(', ');
  }

  if (
    typeof answerValue === 'object'
  ) {

    if (
      typeof answerValue.full ===
      'string'
    ) {
      return answerValue.full
        .trim();
    }

    const nameParts = [
      answerValue.prefix,
      answerValue.first,
      answerValue.middle,
      answerValue.last,
      answerValue.suffix,
    ]
      .filter(Boolean)
      .map(
        (part) =>
          String(part).trim()
      )
      .filter(Boolean);

    if (nameParts.length) {
      return nameParts.join(' ');
    }

    const phoneParts = [
      answerValue.area,
      answerValue.phone,
    ]
      .filter(Boolean)
      .map(
        (part) =>
          String(part).trim()
      )
      .filter(Boolean);

    if (phoneParts.length) {
      return phoneParts.join('');
    }

    return Object.values(
      answerValue
    )
      .filter(
        (part) =>
          typeof part === 'string' ||
          typeof part === 'number'
      )
      .map(
        (part) =>
          String(part).trim()
      )
      .filter(Boolean)
      .join(' ');
  }

  return '';
}


function getAnswerTextByQuestion(
  submission,
  possibleLabels
) {
  const answerObject =
    findAnswerByQuestion(
      submission,
      possibleLabels
    );

  if (!answerObject) {
    return '';
  }

  return answerToText(
    answerObject.answer
  );
}


function getWaiverAthleteName(
  submission
) {
  return getAnswerTextByQuestion(
    submission,
    [
      'Participant / Athlete Full Name',
    ]
  );
}


function getWaiverGuardianName(
  submission
) {
  return getAnswerTextByQuestion(
    submission,
    [
      'Parent/Legal Guardian Name',
      'Parent / Legal Guardian Name',
    ]
  );
}


function getWaiverEmail(
  submission
) {
  return getAnswerTextByQuestion(
    submission,
    [
      'Email Address of Person Completing This Form',
    ]
  );
}


function getWaiverPhone(
  submission
) {
  return getAnswerTextByQuestion(
    submission,
    [
      'Phone Number of Person Completing This Form',
    ]
  );
}


function getWaiverActivity(
  submission
) {
  return getAnswerTextByQuestion(
    submission,
    [
      'Primary Activity or Program',
    ]
  );
}


function hasParentGuardianSignature(
  submission
) {
  const signature =
    getAnswerTextByQuestion(
      submission,
      [
        'Parent/Legal Guardian Signature (Required if under 18)',
        'Parent / Legal Guardian Signature (Required if under 18)',
      ]
    );

  return Boolean(
    String(
      signature || ''
    ).trim()
  );
}


function isMembershipActivity(
  value
) {
  const normalized =
    normalizeQuestionText(
      value
    );

  return (
    normalized.includes(
      'membership'
    ) ||
    normalized.includes(
      'member'
    )
  );
}


/* =========================================================
   JOTFORM WAIVER MATCHING
   ========================================================= */

function isMatchingMembershipWaiver(
  submission,
  contact
) {
  if (
    submission?.status &&
    String(
      submission.status
    ).toUpperCase() !==
      'ACTIVE'
  ) {
    return false;
  }


  const athleteName =
    getWaiverAthleteName(
      submission
    );

  const guardianName =
    getWaiverGuardianName(
      submission
    );

  const waiverEmail =
    getWaiverEmail(
      submission
    );

  const waiverPhone =
    getWaiverPhone(
      submission
    );

  const activity =
    getWaiverActivity(
      submission
    );


  /*
   * This must be a Hit Lab membership
   * waiver selection—not merely a
   * tryout or unrelated activity.
   */
  if (
    !isMembershipActivity(
      activity
    )
  ) {
    return false;
  }


  /*
   * 13U athletes are minors.
   * Require the parent/legal guardian
   * signature before activation.
   */
  if (
    !hasParentGuardianSignature(
      submission
    )
  ) {
    return false;
  }


  /*
   * Athlete name must match.
   */
  const normalizedWaiverAthlete =
    normalizeIdentity(
      athleteName
    );

  const normalizedCheckoutAthlete =
    normalizeIdentity(
      contact.playerName
    );


  if (
    !normalizedWaiverAthlete ||
    !normalizedCheckoutAthlete ||
    normalizedWaiverAthlete !==
      normalizedCheckoutAthlete
  ) {
    return false;
  }


  /*
   * Require at least one additional
   * identity match so two athletes with
   * the same name cannot be accidentally
   * linked.
   */

  const emailMatches =
    Boolean(
      normalizeEmail(
        waiverEmail
      )
    ) &&
    Boolean(
      normalizeEmail(
        contact.email
      )
    ) &&
    normalizeEmail(
      waiverEmail
    ) ===
      normalizeEmail(
        contact.email
      );


  const guardianMatches =
    Boolean(
      normalizeIdentity(
        guardianName
      )
    ) &&
    Boolean(
      normalizeIdentity(
        contact.parentGuardianName
      )
    ) &&
    normalizeIdentity(
      guardianName
    ) ===
      normalizeIdentity(
        contact.parentGuardianName
      );


  const phoneMatches =
    Boolean(
      normalizePhone(
        waiverPhone
      )
    ) &&
    Boolean(
      normalizePhone(
        contact.phone
      )
    ) &&
    normalizePhone(
      waiverPhone
    ) ===
      normalizePhone(
        contact.phone
      );


  return (
    emailMatches ||
    guardianMatches ||
    phoneMatches
  );
}


async function findExistingMembershipWaiver(
  contact
) {
  const apiKey =
    String(
      process.env
        .JOTFORM_API_KEY ||
      ''
    ).trim();


  if (!apiKey) {

    console.warn(
      '13U waiver lookup skipped: JOTFORM_API_KEY is not configured'
    );

    return {
      lookupStatus:
        'unavailable',

      match:
        null,
    };
  }


  try {

    const endpoint =
      new URL(
        `https://api.jotform.com/form/${JOTFORM_FORM_ID}/submissions`
      );

    endpoint.searchParams.set(
      'limit',
      '1000'
    );

    endpoint.searchParams.set(
      'orderby',
      'created_at'
    );

    endpoint.searchParams.set(
      'direction',
      'DESC'
    );


    const response =
      await fetch(
        endpoint.toString(),
        {
          method:
            'GET',

          headers: {
            APIKEY:
              apiKey,

            Accept:
              'application/json',
          },
        }
      );


    const bodyText =
      await response.text();


    if (!response.ok) {

      console.error(
        '13U Jotform waiver lookup failed',
        {
          status:
            response.status,
        }
      );

      return {
        lookupStatus:
          'unavailable',

        match:
          null,
      };
    }


    let body;


    try {

      body =
        JSON.parse(
          bodyText
        );

    } catch {

      console.error(
        '13U Jotform waiver lookup returned invalid JSON'
      );

      return {
        lookupStatus:
          'unavailable',

        match:
          null,
      };
    }


    const submissions =
      Array.isArray(
        body?.content
      )
        ? body.content
        : [];


    const match =
      submissions.find(
        (submission) =>
          isMatchingMembershipWaiver(
            submission,
            contact
          )
      );


    if (!match) {

      return {
        lookupStatus:
          'not_found',

        match:
          null,
      };
    }


    return {
      lookupStatus:
        'matched',

      match: {
        submissionId:
          String(
            match.id || ''
          ),

        createdAt:
          String(
            match.created_at || ''
          ),
      },
    };

  } catch (error) {

    console.error(
      '13U Jotform waiver lookup error',
      {
        message:
          error.message,
      }
    );

    return {
      lookupStatus:
        'unavailable',

      match:
        null,
    };
  }
}


/* =========================================================
   FORMATTING
   ========================================================= */

function formatCurrency(
  amountInCents
) {
  return new Intl.NumberFormat(
    'en-US',
    {
      style:
        'currency',

      currency:
        'USD',
    }
  ).format(
    Number(
      amountInCents || 0
    ) / 100
  );
}


function formatEventDate(
  eventCreated
) {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',

      timeZone:
        'America/Los_Angeles',
    }
  ).format(
    new Date(
      eventCreated * 1000
    )
  );
}


function formatPaymentOption(
  value
) {
  if (
    value === 'installment'
  ) {
    return 'Installment Plan';
  }

  if (
    [
      'pay_in_full',
      'pay-in-full',
      'full',
    ].includes(value)
  ) {
    return 'Pay in Full';
  }

  return (
    value ||
    'Team Payment'
  );
}


function getMemberCardUrl(
  sessionId
) {
  return (
    `${getSiteUrl()}/member/` +
    `${encodeURIComponent(
      sessionId
    )}`
  );
}


/* =========================================================
   RESEND
   ========================================================= */

async function sendResendEmail({
  to,
  subject,
  html,
  text,
  eventId,
  purpose,
}) {
  if (
    !process.env.RESEND_API_KEY
  ) {
    throw new Error(
      'RESEND_API_KEY is not configured'
    );
  }


  const response =
    await fetch(
      'https://api.resend.com/emails',
      {
        method:
          'POST',

        headers: {
          Authorization:
            `Bearer ${process.env.RESEND_API_KEY}`,

          'Content-Type':
            'application/json',

          'Idempotency-Key':
            `13u/${purpose}/${eventId}`,
        },

        body:
          JSON.stringify({
            from:
              NOTIFICATION_FROM,

            to:
              Array.isArray(to)
                ? to
                : [to],

            subject,

            html,

            text,
          }),
      }
    );


  const responseBody =
    await response.text();


  if (!response.ok) {
    throw new Error(
      `Resend email failed (${response.status}): ${responseBody}`
    );
  }


  console.log(
    '13U Resend email sent',
    {
      eventId,
      purpose,
      subject,
    }
  );
}


/* =========================================================
   INITIAL PAYMENT EMAILS
   ========================================================= */

async function sendInitialPaymentEmails(
  session,
  event,
  activation
) {
  if (
    !is13UCheckout(session)
  ) {
    return;
  }


  const contact =
    getCheckoutContact(
      session
    );


  const paymentOption =
    session.metadata
      ?.payment_option ||
    '';


  const amountPaid =
    session.amount_total ||
    session.amount_subtotal ||
    0;


  const isInstallment =
    paymentOption ===
    'installment';


  const remainingBalance =
    isInstallment
      ? 99500
      : 0;


  const upcomingPayments =
    isInstallment
      ? '$500 on November 1, 2026; $495 on February 1, 2027'
      : 'None — team package paid in full';


  const waiverCompleted =
    Boolean(
      activation
        ?.waiverCompleted
    );


  const memberCardUrl =
    getMemberCardUrl(
      session.id
    );


  const membershipActivation =
    waiverCompleted
      ? 'ACTIVE — payment confirmed and athlete waiver verified'
      : 'PENDING — athlete waiver required';


  const internalSubject =
    `13U Baseball Academy — Payment Received — ` +
    `${contact.playerName || 'Player'} — ` +
    `${formatCurrency(
      amountPaid
    )}`;


  const internalText = `
CYOJ Hit Lab 13U Baseball Academy Payment Received

Player: ${contact.playerName || 'Not provided'}
Parent/Guardian: ${contact.parentGuardianName || 'Not provided'}
Email: ${contact.email || 'Not provided'}
Phone: ${contact.phone || 'Not provided'}

Payment Option: ${formatPaymentOption(paymentOption)}
Amount Received: ${formatCurrency(amountPaid)}
Remaining Balance: ${formatCurrency(remainingBalance)}
Upcoming Payments: ${upcomingPayments}

Membership Activation:
${membershipActivation}

Waiver Lookup:
${activation?.lookupStatus || 'not checked'}

Digital Membership Status:
${memberCardUrl}

Stripe Checkout Session:
${session.id}

Stripe Payment Intent:
${getId(session.payment_intent) || 'Not available'}

Payment Received:
${formatEventDate(event.created)}
`;


  const internalHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">

      <h2>
        13U Baseball Academy Payment Received
      </h2>

      <p>
        <strong>Player:</strong>
        ${escapeHtml(
          contact.playerName ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Parent/Guardian:</strong>
        ${escapeHtml(
          contact.parentGuardianName ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Email:</strong>
        ${escapeHtml(
          contact.email ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Phone:</strong>
        ${escapeHtml(
          contact.phone ||
          'Not provided'
        )}
      </p>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;" />

      <p>
        <strong>Payment Option:</strong>
        ${escapeHtml(
          formatPaymentOption(
            paymentOption
          )
        )}
      </p>

      <p>
        <strong>Amount Received:</strong>
        ${formatCurrency(
          amountPaid
        )}
      </p>

      <p>
        <strong>Remaining Balance:</strong>
        ${formatCurrency(
          remainingBalance
        )}
      </p>

      <p>
        <strong>Upcoming Payments:</strong>
        ${escapeHtml(
          upcomingPayments
        )}
      </p>

      <p>
        <strong>Membership Activation:</strong>
        ${escapeHtml(
          membershipActivation
        )}
      </p>

      <p>
        <strong>Waiver Lookup:</strong>
        ${escapeHtml(
          activation?.lookupStatus ||
          'not checked'
        )}
      </p>

      <p>
        <strong>Received:</strong>
        ${escapeHtml(
          formatEventDate(
            event.created
          )
        )}
      </p>

      <p>
        <strong>
          Digital Membership Status:
        </strong>
        <br>

        <a href="${escapeHtml(
          memberCardUrl
        )}">
          ${escapeHtml(
            memberCardUrl
          )}
        </a>
      </p>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;" />

      <p style="font-size:12px;color:#6b7280;">
        Checkout Session:
        ${escapeHtml(
          session.id
        )}
        <br>

        Payment Intent:
        ${escapeHtml(
          getId(
            session.payment_intent
          ) ||
          'Not available'
        )}
      </p>

    </div>
  `;


  await sendResendEmail({
    to:
      NOTIFICATION_TO,

    subject:
      internalSubject,

    html:
      internalHtml,

    text:
      internalText,

    eventId:
      event.id,

    purpose:
      'internal-payment-received',
  });


  if (!contact.email) {

    console.warn(
      '13U membership email skipped: no payer email',
      {
        eventId:
          event.id,

        sessionId:
          session.id,
      }
    );

    return;
  }


  /*
   * PAYMENT + WAIVER COMPLETE
   */
  if (waiverCompleted) {

    const memberSubject =
      `${contact.playerName || '13U Academy Athlete'} — ` +
      'Your CYOJ Hit Lab Digital Membership Card';


    const memberText = `
CYOJ Hit Lab 2027 13U Baseball Academy

Payment has been confirmed for ${contact.playerName || 'your athlete'}.

The required CYOJ Hit Lab Athlete Waiver has also been verified.

Your digital Academy membership card is active:

${memberCardUrl}

The QR code on the card opens the live membership record and current status.

Questions:
support@cyojhitlab.com
`;


    const memberHtml = `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">

        <p style="color:#0d7a3b;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;">
          CYOJ Hit Lab · 2027 13U Baseball Academy
        </p>

        <h2>
          Your Digital Membership Card Is Active
        </h2>

        <p>
          Payment has been confirmed for
          <strong>
            ${escapeHtml(
              contact.playerName ||
              'your athlete'
            )}
          </strong>.
        </p>

        <p>
          The required CYOJ Hit Lab Athlete
          Waiver has also been verified.
          The athlete's digital membership
          card is now active.
        </p>

        <p style="margin:28px 0;">

          <a
            href="${escapeHtml(
              memberCardUrl
            )}"
            style="display:inline-block;background:#37cf73;color:#051009;text-decoration:none;font-weight:bold;padding:14px 20px;"
          >
            Open Digital Membership Card
          </a>

        </p>

        <p style="font-size:12px;color:#6b7280;">
          If the button does not work,
          copy this link into your browser:
          <br>

          <a href="${escapeHtml(
            memberCardUrl
          )}">
            ${escapeHtml(
              memberCardUrl
            )}
          </a>
        </p>

        <p>
          Questions?
          <a href="mailto:support@cyojhitlab.com">
            support@cyojhitlab.com
          </a>
        </p>

      </div>
    `;


    await sendResendEmail({
      to:
        contact.email,

      subject:
        memberSubject,

      html:
        memberHtml,

      text:
        memberText,

      eventId:
        event.id,

      purpose:
        'membership-card',
    });


    return;
  }


  /*
   * PAYMENT COMPLETE
   * WAIVER STILL REQUIRED
   */

  const pendingSubject =
    `${contact.playerName || '13U Academy Athlete'} — ` +
    'Payment Confirmed · Athlete Waiver Required';


  const pendingText = `
CYOJ Hit Lab 2027 13U Baseball Academy

Payment has been confirmed for ${contact.playerName || 'your athlete'}.

One step remains before the athlete's CYOJ Hit Lab digital membership card can become active:

Complete the current CYOJ Hit Lab Athlete Waiver:
${WAIVER_URL}

Membership status:
${memberCardUrl}

Once the required waiver is verified, the same membership record will become eligible for active status.

Questions:
support@cyojhitlab.com
`;


  const pendingHtml = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">

      <p style="color:#0d7a3b;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;">
        CYOJ Hit Lab · 2027 13U Baseball Academy
      </p>

      <h2>
        Payment Confirmed
      </h2>

      <p>
        Payment has been confirmed for
        <strong>
          ${escapeHtml(
            contact.playerName ||
            'your athlete'
          )}
        </strong>.
      </p>

      <p>
        One step remains before the
        athlete's CYOJ Hit Lab digital
        membership card can become active:
        a current CYOJ Hit Lab Athlete
        Waiver must be completed and
        verified.
      </p>

      <p style="margin:28px 0;">

        <a
          href="${WAIVER_URL}"
          style="display:inline-block;background:#37cf73;color:#051009;text-decoration:none;font-weight:bold;padding:14px 20px;"
        >
          Complete Athlete Waiver
        </a>

      </p>

      <p style="font-size:12px;color:#6b7280;">
        Already completed the waiver?
        You can view the athlete's current
        membership status here:
        <br><br>

        <a href="${escapeHtml(
          memberCardUrl
        )}">
          ${escapeHtml(
            memberCardUrl
          )}
        </a>
      </p>

      <p>
        Questions?
        <a href="mailto:support@cyojhitlab.com">
          support@cyojhitlab.com
        </a>
      </p>

    </div>
  `;


  await sendResendEmail({
    to:
      contact.email,

    subject:
      pendingSubject,

    html:
      pendingHtml,

    text:
      pendingText,

    eventId:
      event.id,

    purpose:
      'membership-activation-required',
  });
}


/* =========================================================
   INITIAL PAYMENT FAILURE
   ========================================================= */

async function sendInitialPaymentFailureEmail(
  session,
  event
) {
  if (
    !is13UCheckout(session)
  ) {
    return;
  }


  const contact =
    getCheckoutContact(
      session
    );


  const amountDue =
    session.amount_total ||
    session.amount_subtotal ||
    0;


  const subject =
    `ACTION REQUIRED — 13U Baseball Academy Initial Payment Failed — ` +
    `${contact.playerName || 'Player'}`;


  const text = `
CYOJ Hit Lab 13U Baseball Academy Initial Payment Failed

Player: ${contact.playerName || 'Not provided'}
Parent/Guardian: ${contact.parentGuardianName || 'Not provided'}
Email: ${contact.email || 'Not provided'}

Amount Attempted:
${formatCurrency(amountDue)}

Stripe Checkout Session:
${session.id}

Failure Recorded:
${formatEventDate(event.created)}
`;


  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">

      <h2 style="color:#b91c1c;">
        Initial Payment Attention Required
      </h2>

      <p>
        <strong>
          CYOJ Hit Lab — 13U Baseball Academy
        </strong>
      </p>

      <p>
        <strong>Player:</strong>
        ${escapeHtml(
          contact.playerName ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Parent/Guardian:</strong>
        ${escapeHtml(
          contact.parentGuardianName ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Email:</strong>
        ${escapeHtml(
          contact.email ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Amount Attempted:</strong>
        ${formatCurrency(
          amountDue
        )}
      </p>

      <p>
        <strong>Failure Recorded:</strong>
        ${escapeHtml(
          formatEventDate(
            event.created
          )
        )}
      </p>

      <p style="font-size:12px;color:#6b7280;">
        Checkout Session:
        ${escapeHtml(
          session.id
        )}
      </p>

    </div>
  `;


  await sendResendEmail({
    to:
      NOTIFICATION_TO,

    subject,

    html,

    text,

    eventId:
      event.id,

    purpose:
      'initial-payment-failed',
  });
}


/* =========================================================
   CUSTOMER CONTACT
   ========================================================= */

async function getCustomerContact(
  stripe,
  customerValue
) {
  const customerId =
    getId(
      customerValue
    );


  if (!customerId) {
    return {
      parentGuardianName:
        '',

      playerName:
        '',

      email:
        '',

      phone:
        '',
    };
  }


  const customer =
    await stripe.customers
      .retrieve(
        customerId
      );


  if (customer.deleted) {
    return {
      parentGuardianName:
        '',

      playerName:
        '',

      email:
        '',

      phone:
        '',
    };
  }


  return {
    parentGuardianName:
      customer.metadata
        ?.parent_guardian_name ||
      '',

    playerName:
      customer.metadata
        ?.player_name ||
      '',

    email:
      customer.email ||
      '',

    phone:
      customer.phone ||
      '',
  };
}


/* =========================================================
   INSTALLMENT EMAIL
   ========================================================= */

async function sendInstallmentEmail(
  stripe,
  invoice,
  event,
  succeeded
) {
  if (
    !is13UScheduledInstallmentInvoice(
      invoice
    )
  ) {
    return;
  }


  const contact =
    await getCustomerContact(
      stripe,
      invoice.customer
    );


  const installmentKey =
    invoice.metadata
      .installment_key;


  const installmentLabel =
    installmentKey ===
    'installment_2'
      ? 'November Installment'
      : 'February Installment';


  const amount =
    succeeded
      ? (
          invoice.amount_paid ||
          invoice.amount_due ||
          0
        )
      : (
          invoice.amount_due ||
          invoice.amount_remaining ||
          0
        );


  const remainingBalance =
    succeeded
      ? (
          installmentKey ===
          'installment_2'
            ? 49500
            : 0
        )
      : (
          invoice.amount_remaining ||
          invoice.amount_due ||
          0
        );


  const nextPayment =
    succeeded &&
    installmentKey ===
      'installment_2'
      ? '$495 on February 1, 2027'
      : succeeded
        ? 'None — team package paid in full'
        : 'Payment attention required';


  const subject =
    succeeded
      ? (
          `13U Baseball Academy — ${installmentLabel} Paid — ` +
          `${contact.playerName || 'Player'} — ` +
          `${formatCurrency(amount)}`
        )
      : (
          `ACTION REQUIRED — 13U Baseball Academy Payment Failed — ` +
          `${contact.playerName || 'Player'}`
        );


  const text = `
CYOJ Hit Lab 13U Baseball Academy ${succeeded ? 'Installment Payment Received' : 'Payment Failed'}

Player: ${contact.playerName || 'Not provided'}
Parent/Guardian: ${contact.parentGuardianName || 'Not provided'}
Email: ${contact.email || 'Not provided'}
Phone: ${contact.phone || 'Not provided'}

Installment:
${installmentLabel}

${succeeded ? 'Amount Received' : 'Amount Due'}:
${formatCurrency(amount)}

Remaining Balance:
${formatCurrency(remainingBalance)}

Next Payment / Status:
${nextPayment}

Stripe Invoice:
${invoice.id}

${succeeded ? 'Payment Received' : 'Failure Recorded'}:
${formatEventDate(event.created)}
`;


  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">

      <h2 style="${succeeded ? '' : 'color:#b91c1c;'}">
        ${escapeHtml(
          succeeded
            ? `${installmentLabel} Received`
            : 'Payment Attention Required'
        )}
      </h2>

      <p>
        <strong>
          CYOJ Hit Lab — 13U Baseball Academy
        </strong>
      </p>

      <p>
        <strong>Player:</strong>
        ${escapeHtml(
          contact.playerName ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Parent/Guardian:</strong>
        ${escapeHtml(
          contact.parentGuardianName ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Email:</strong>
        ${escapeHtml(
          contact.email ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Phone:</strong>
        ${escapeHtml(
          contact.phone ||
          'Not provided'
        )}
      </p>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;" />

      <p>
        <strong>Installment:</strong>
        ${escapeHtml(
          installmentLabel
        )}
      </p>

      <p>
        <strong>
          ${succeeded
            ? 'Amount Received'
            : 'Amount Due'}:
        </strong>

        ${formatCurrency(
          amount
        )}
      </p>

      <p>
        <strong>
          Remaining Balance:
        </strong>

        ${formatCurrency(
          remainingBalance
        )}
      </p>

      <p>
        <strong>
          Next Payment / Status:
        </strong>

        ${escapeHtml(
          nextPayment
        )}
      </p>

      <p>
        <strong>
          ${succeeded
            ? 'Payment Received'
            : 'Failure Recorded'}:
        </strong>

        ${escapeHtml(
          formatEventDate(
            event.created
          )
        )}
      </p>

      <p style="font-size:12px;color:#6b7280;">
        Stripe Invoice:
        ${escapeHtml(
          invoice.id
        )}
      </p>

    </div>
  `;


  await sendResendEmail({
    to:
      NOTIFICATION_TO,

    subject,

    html,

    text,

    eventId:
      event.id,

    purpose:
      succeeded
        ? `installment-success-${installmentKey}`
        : `installment-failure-${installmentKey}`,
  });
}


/* =========================================================
   RECORD INITIAL PAYMENT
   ========================================================= */

async function recordSuccessfulCheckout(
  stripe,
  session,
  eventCreated
) {
  if (
    !is13UCheckout(session)
  ) {
    return {
      waiverCompleted:
        false,

      lookupStatus:
        'not_applicable',
    };
  }


  const customerId =
    getId(
      session.customer
    );


  const paymentIntentId =
    getId(
      session.payment_intent
    );


  const invoiceId =
    getId(
      session.invoice
    );


  if (
    !customerId ||
    !paymentIntentId
  ) {
    throw new Error(
      `Missing customer or PaymentIntent for Checkout Session ${session.id}`
    );
  }


  const contact =
    getCheckoutContact(
      session
    );


  if (
    !contact.parentGuardianName ||
    !contact.playerName
  ) {
    throw new Error(
      `Required parent/player information missing for Checkout Session ${session.id}`
    );
  }


  const paymentReceivedAt =
    new Date(
      eventCreated * 1000
    ).toISOString();


  const paymentOption =
    session.metadata
      ?.payment_option ||
    '';


  const isInstallment =
    paymentOption ===
    'installment';


  /*
   * Retrieve customer first so an
   * already-verified Hit Lab waiver
   * remains valid.
   */
  const existingCustomer =
    await stripe.customers
      .retrieve(
        customerId
      );


  const existingCustomerMetadata =
    !existingCustomer.deleted
      ? (
          existingCustomer.metadata ||
          {}
        )
      : {};


  const alreadyVerified =
    isWaiverCompletedValue(
      session.metadata
        ?.waiver_status
    ) ||
    isWaiverCompletedValue(
      session.metadata
        ?.hit_lab_waiver_status
    ) ||
    isWaiverCompletedValue(
      existingCustomerMetadata
        .waiver_status
    ) ||
    isWaiverCompletedValue(
      existingCustomerMetadata
        .hit_lab_waiver_status
    );


  let waiverLookup = {
    lookupStatus:
      'already_verified',

    match:
      null,
  };


  if (!alreadyVerified) {

    waiverLookup =
      await findExistingMembershipWaiver(
        contact
      );
  }


  const waiverMatch =
    waiverLookup
      .match;


  const waiverCompleted =
    alreadyVerified ||
    Boolean(
      waiverMatch
    );


  const waiverVerifiedAt =
    waiverCompleted
      ? (
          existingCustomerMetadata
            .waiver_verified_at ||
          session.metadata
            ?.waiver_verified_at ||
          paymentReceivedAt
        )
      : '';


  const waiverSubmissionId =
    waiverMatch
      ?.submissionId ||
    existingCustomerMetadata
      .waiver_submission_id ||
    session.metadata
      ?.waiver_submission_id ||
    '';


  const metadata = {
    ...(session.metadata || {}),

    parent_guardian_name:
      contact.parentGuardianName,

    player_name:
      contact.playerName,

    initial_checkout_session_id:
      session.id,

    initial_payment_intent_id:
      paymentIntentId,

    initial_payment_status:
      'paid',

    initial_payment_received_at:
      paymentReceivedAt,

    membership_card_session_id:
      session.id,

    waiver_form_id:
      JOTFORM_FORM_ID,

    waiver_status:
      waiverCompleted
        ? 'completed'
        : 'required',

    waiver_lookup_status:
      waiverCompleted
        ? 'matched'
        : waiverLookup
            .lookupStatus,

    membership_status:
      waiverCompleted
        ? 'active'
        : 'waiver_required',

    enrollment_status:
      isInstallment
        ? 'initial_payment_received'
        : 'paid_in_full',
  };


  if (waiverCompleted) {

    metadata
      .waiver_verified_at =
        waiverVerifiedAt;


    metadata
      .membership_card_issued_at =
        existingCustomerMetadata
          .membership_card_issued_at ||
        session.metadata
          ?.membership_card_issued_at ||
        paymentReceivedAt;


    if (waiverSubmissionId) {
      metadata
        .waiver_submission_id =
          waiverSubmissionId;
    }

  } else {

    metadata
      .waiver_checked_at =
        paymentReceivedAt;
  }


  const customerUpdate = {
    name:
      contact.parentGuardianName,

    metadata,
  };


  if (contact.email) {
    customerUpdate.email =
      contact.email;
  }


  if (contact.phone) {
    customerUpdate.phone =
      contact.phone;
  }


  /*
   * INSTALLMENT PLAN
   *
   * Store the successful initial
   * payment method as the customer's
   * default for November and February.
   */
  if (isInstallment) {

    const paymentIntent =
      await stripe.paymentIntents
        .retrieve(
          paymentIntentId
        );


    const paymentMethodId =
      getId(
        paymentIntent
          .payment_method
      );


    if (!paymentMethodId) {
      throw new Error(
        `Missing payment method for PaymentIntent ${paymentIntentId}`
      );
    }


    customerUpdate
      .invoice_settings = {
        default_payment_method:
          paymentMethodId,
      };
  }


  const updates = [

    stripe.customers.update(
      customerId,
      customerUpdate
    ),

    stripe.paymentIntents.update(
      paymentIntentId,
      {
        metadata,
      }
    ),

    stripe.checkout.sessions.update(
      session.id,
      {
        metadata,
      }
    ),
  ];


  if (invoiceId) {

    updates.push(
      stripe.invoices.update(
        invoiceId,
        {
          metadata,
        }
      )
    );
  }


  await Promise.all(
    updates
  );


  return {
    waiverCompleted,

    waiverSubmissionId:
      waiverSubmissionId ||
      null,

    lookupStatus:
      waiverCompleted
        ? 'matched'
        : waiverLookup
            .lookupStatus,
  };
}


/* =========================================================
   INSTALLMENT SUCCESS
   ========================================================= */

async function recordInstallmentSuccess(
  stripe,
  invoice,
  eventCreated
) {
  if (
    !is13UScheduledInstallmentInvoice(
      invoice
    )
  ) {
    return;
  }


  const customerId =
    getId(
      invoice.customer
    );


  if (!customerId) {
    throw new Error(
      `Missing customer for Invoice ${invoice.id}`
    );
  }


  const installmentKey =
    invoice.metadata
      .installment_key;


  const paymentReceivedAt =
    new Date(
      eventCreated * 1000
    ).toISOString();


  /*
   * Do not activate membership here
   * unless the waiver was previously
   * verified.
   */
  const customer =
    await stripe.customers
      .retrieve(
        customerId
      );


  const customerMetadata =
    !customer.deleted
      ? (
          customer.metadata ||
          {}
        )
      : {};


  const waiverCompleted =
    isWaiverCompletedValue(
      customerMetadata
        .waiver_status
    ) ||
    isWaiverCompletedValue(
      customerMetadata
        .hit_lab_waiver_status
    );


  await Promise.all([

    stripe.invoices.update(
      invoice.id,
      {
        metadata: {
          ...(invoice.metadata || {}),

          installment_payment_status:
            'paid',

          installment_payment_received_at:
            paymentReceivedAt,
        },
      }
    ),


    stripe.customers.update(
      customerId,
      {
        metadata: {

          [`${installmentKey}_payment_status`]:
            'paid',

          [`${installmentKey}_payment_received_at`]:
            paymentReceivedAt,

          [`${installmentKey}_invoice_id`]:
            invoice.id,

          enrollment_status:
            installmentKey ===
            'installment_3'
              ? 'paid_in_full'
              : 'installment_2_paid',

          membership_status:
            waiverCompleted
              ? 'active'
              : 'waiver_required',
        },
      }
    ),
  ]);
}


/* =========================================================
   INSTALLMENT FAILURE
   ========================================================= */

async function recordInstallmentFailure(
  stripe,
  invoice,
  eventCreated
) {
  if (
    !is13UScheduledInstallmentInvoice(
      invoice
    )
  ) {
    return;
  }


  const customerId =
    getId(
      invoice.customer
    );


  if (!customerId) {
    throw new Error(
      `Missing customer for Invoice ${invoice.id}`
    );
  }


  const installmentKey =
    invoice.metadata
      .installment_key;


  const failedAt =
    new Date(
      eventCreated * 1000
    ).toISOString();


  const attemptCount =
    String(
      invoice.attempt_count ||
      1
    );


  await Promise.all([

    stripe.invoices.update(
      invoice.id,
      {
        metadata: {
          ...(invoice.metadata || {}),

          installment_payment_status:
            'failed',

          installment_payment_failed_at:
            failedAt,

          installment_payment_attempt_count:
            attemptCount,
        },
      }
    ),


    stripe.customers.update(
      customerId,
      {
        metadata: {

          [`${installmentKey}_payment_status`]:
            'failed',

          [`${installmentKey}_payment_failed_at`]:
            failedAt,

          [`${installmentKey}_invoice_id`]:
            invoice.id,

          [`${installmentKey}_attempt_count`]:
            attemptCount,

          enrollment_status:
            'payment_attention_required',

          membership_status:
            'payment_attention_required',
        },
      }
    ),
  ]);
}


/* =========================================================
   WEBHOOK HANDLER
   ========================================================= */

export default async function handler(
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


  if (
    !process.env
      .STRIPE_SECRET_KEY ||
    !process.env
      .STRIPE_WEBHOOK_SECRET
  ) {

    return res
      .status(500)
      .json({
        error:
          'Stripe webhook is not configured',
      });
  }


  const signatureHeader =
    req.headers[
      'stripe-signature'
    ];


  const signature =
    Array.isArray(
      signatureHeader
    )
      ? signatureHeader[0]
      : signatureHeader;


  if (!signature) {

    return res
      .status(400)
      .json({
        error:
          'Missing Stripe signature',
      });
  }


  const stripe =
    getStripe();


  let event;


  try {

    const rawBody =
      await getRawBody(
        req
      );


    event =
      stripe.webhooks
        .constructEvent(
          rawBody,
          signature,
          process.env
            .STRIPE_WEBHOOK_SECRET
        );

  } catch (error) {

    console.error(
      '13U Stripe webhook signature verification failed',
      error.message
    );


    return res
      .status(400)
      .json({
        error:
          'Invalid webhook signature',
      });
  }


  try {


    /*
     * IMMEDIATE PAYMENT SUCCESS
     */
    if (
      event.type ===
      'checkout.session.completed'
    ) {

      const session =
        event.data.object;


      if (
        is13UCheckout(
          session
        ) &&
        session.payment_status ===
          'paid'
      ) {

        const activation =
          await recordSuccessfulCheckout(
            stripe,
            session,
            event.created
          );


        await sendInitialPaymentEmails(
          session,
          event,
          activation
        );
      }
    }


    /*
     * DELAYED PAYMENT SUCCESS
     */
    if (
      event.type ===
      'checkout.session.async_payment_succeeded'
    ) {

      const session =
        event.data.object;


      if (
        is13UCheckout(
          session
        )
      ) {

        const activation =
          await recordSuccessfulCheckout(
            stripe,
            session,
            event.created
          );


        await sendInitialPaymentEmails(
          session,
          event,
          activation
        );
      }
    }


    /*
     * DELAYED INITIAL PAYMENT FAILURE
     */
    if (
      event.type ===
      'checkout.session.async_payment_failed'
    ) {

      const session =
        event.data.object;


      await sendInitialPaymentFailureEmail(
        session,
        event
      );
    }


    /*
     * SCHEDULED INSTALLMENT SUCCESS
     */
    if (
      event.type ===
      'invoice.payment_succeeded'
    ) {

      const invoice =
        event.data.object;


      await recordInstallmentSuccess(
        stripe,
        invoice,
        event.created
      );


      await sendInstallmentEmail(
        stripe,
        invoice,
        event,
        true
      );
    }


    /*
     * SCHEDULED INSTALLMENT FAILURE
     */
    if (
      event.type ===
      'invoice.payment_failed'
    ) {

      const invoice =
        event.data.object;


      await recordInstallmentFailure(
        stripe,
        invoice,
        event.created
      );


      await sendInstallmentEmail(
        stripe,
        invoice,
        event,
        false
      );
    }


    return res
      .status(200)
      .json({
        received:
          true,
      });


  } catch (error) {

    console.error(
      '13U Stripe webhook processing failed',
      {
        eventId:
          event.id,

        eventType:
          event.type,

        message:
          error.message,
      }
    );


    return res
      .status(500)
      .json({
        error:
          'Webhook processing failed',
      });
  }
}
