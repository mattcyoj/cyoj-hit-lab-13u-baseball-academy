import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: false,
  },
};

const STRIPE_API_VERSION = '2026-07-29.dahlia';

const PROGRAM = 'CYOJ Hit Lab 2027 Baseball Academy';
const TEAM = '13U Baseball Academy';
const TEAM_CODE = '13U_BASEBALL_ACADEMY';

const JOTFORM_FORM_ID = '262305529358158';
const JOTFORM_PARENT_SIGNATURE_FIELD_ID = '66';

const JOTFORM_WAIVER_URL =
  'https://form.jotform.com/262305529358158';

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';

const NOTIFICATION_TO =
  'support@cyojhitlab.com';

const NOTIFICATION_FROM =
  'CYOJ Hit Lab Payments <payments@notifications.cyojhitlabacademy.com>';


function getStripe() {
  return new Stripe(
    process.env.STRIPE_SECRET_KEY,
    {
      apiVersion: STRIPE_API_VERSION,
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


function is13UCheckout(session) {
  const metadata =
    session.metadata || {};

  return (
    metadata.team === TEAM &&
    (
      metadata.team_code === TEAM_CODE ||
      metadata.program === PROGRAM
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
    metadata.team_code === TEAM_CODE &&
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


function escapeHtml(value) {
  return String(
    value ?? ''
  )
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


function formatCurrency(
  amountInCents
) {
  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
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
      dateStyle: 'medium',
      timeStyle: 'short',
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
   JOTFORM WAIVER HELPERS
   ========================================================= */


function normalizeEmail(value) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}


function normalizeIdentity(value) {
  return String(
    value || ''
  )
    .normalize(
      'NFKD'
    )
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
  return String(
    value || ''
  ).replace(
    /\D/g,
    ''
  );
}


function normalizeQuestionText(value) {
  return String(
    value || ''
  )
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


function answerToText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return String(
      value
    ).trim();
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        answerToText
      )
      .filter(Boolean)
      .join(', ');
  }

  if (
    typeof value === 'object'
  ) {
    if (
      typeof value.full === 'string'
    ) {
      return value.full.trim();
    }

    const nameParts = [
      value.prefix,
      value.first,
      value.middle,
      value.last,
      value.suffix,
    ]
      .filter(Boolean)
      .map(
        (part) =>
          String(part).trim()
      )
      .filter(Boolean);

    if (
      nameParts.length
    ) {
      return nameParts
        .join(' ');
    }

    const phoneParts = [
      value.area,
      value.phone,
    ]
      .filter(Boolean)
      .map(
        (part) =>
          String(part).trim()
      )
      .filter(Boolean);

    if (
      phoneParts.length
    ) {
      return phoneParts
        .join('');
    }

    return Object.values(
      value
    )
      .map(
        answerToText
      )
      .filter(Boolean)
      .join(' ');
  }

  return '';
}


function getSubmissionAnswersMap(
  submission
) {
  let answers =
    submission?.answers;

  /*
   * Jotform may provide answers
   * as either an object or a
   * JSON-encoded string.
   */
  if (
    typeof answers === 'string'
  ) {
    try {
      answers =
        JSON.parse(
          answers
        );
    } catch {
      return {};
    }
  }

  if (
    !answers ||
    typeof answers !==
      'object' ||
    Array.isArray(
      answers
    )
  ) {
    return {};
  }

  return answers;
}


function getSubmissionAnswers(
  submission
) {
  return Object.values(
    getSubmissionAnswersMap(
      submission
    )
  ).filter(Boolean);
}


function findAnswerByQuestion(
  submission,
  possibleLabels
) {
  const normalizedLabels =
    possibleLabels.map(
      normalizeQuestionText
    );

  return (
    getSubmissionAnswers(
      submission
    ).find(
      (answerObject) => {
        const question =
          normalizeQuestionText(
            answerObject?.text
          );

        return normalizedLabels
          .includes(
            question
          );
      }
    ) ||
    null
  );
}


function getAnswerText(
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
    answerObject.answer ??
    answerObject.prettyFormat ??
    ''
  );
}


/*
 * The current LIVE waiver's actual
 * parent/legal guardian signature
 * field is Jotform answer ID 66.
 *
 * Check that exact field first.
 * Keep label matching as a fallback.
 */
function getParentSignature(
  submission
) {
  const answers =
    getSubmissionAnswersMap(
      submission
    );

  const exactField =
    answers[
      JOTFORM_PARENT_SIGNATURE_FIELD_ID
    ];

  if (exactField) {
    const exactValue =
      answerToText(
        exactField.answer ??
        exactField.prettyFormat ??
        ''
      );

    if (exactValue) {
      return exactValue;
    }
  }

  return getAnswerText(
    submission,
    [
      'Parent/Legal Guardian Signature (Required if Participant / Athlete is under 18)',

      'Parent / Legal Guardian Signature (Required if Participant / Athlete is under 18)',

      'Parent/Legal Guardian Signature (Required if under 18)',

      'Parent / Legal Guardian Signature (Required if under 18)',

      'Parent/Guardian Signature (Required if under 18)',
    ]
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


function hasCompletedWaiverMetadata(
  metadata
) {
  const waiverStatus =
    String(
      metadata?.waiver_status ||
      metadata
        ?.hit_lab_waiver_status ||
      ''
    )
      .trim()
      .toLowerCase();

  return [
    'completed',
    'verified',
  ].includes(
    waiverStatus
  );
}


/*
 * A generic "completed" value is
 * NOT enough to activate membership.
 *
 * The verification must belong to:
 *
 * - the current LIVE waiver form
 * - a real Jotform submission
 * - the same athlete when a player
 *   name is supplied
 */
function hasCurrentCompletedWaiverMetadata(
  metadata,
  playerName = ''
) {
  if (
    !hasCompletedWaiverMetadata(
      metadata
    )
  ) {
    return false;
  }

  if (
    String(
      metadata
        ?.waiver_form_id ||
      ''
    ).trim() !==
      JOTFORM_FORM_ID
  ) {
    return false;
  }

  if (
    !String(
      metadata
        ?.waiver_submission_id ||
      ''
    ).trim()
  ) {
    return false;
  }

  if (playerName) {
    const storedPlayer =
      normalizeIdentity(
        metadata?.player_name
      );

    const currentPlayer =
      normalizeIdentity(
        playerName
      );

    if (
      !storedPlayer ||
      !currentPlayer ||
      storedPlayer !==
        currentPlayer
    ) {
      return false;
    }
  }

  return true;
}


function getWaiverData(
  submission
) {
  return {
    athleteName:
      getAnswerText(
        submission,
        [
          'Participant / Athlete Full Name',
        ]
      ),

    guardianName:
      getAnswerText(
        submission,
        [
          'Parent/Legal Guardian Name',
          'Parent / Legal Guardian Name',
        ]
      ),

    email:
      getAnswerText(
        submission,
        [
          'Email Address of Person Completing This Form',
        ]
      ),

    phone:
      getAnswerText(
        submission,
        [
          'Phone Number of Person Completing This Form',
        ]
      ),

    activity:
      getAnswerText(
        submission,
        [
          'Primary Activity or Program',
        ]
      ),

    parentSignature:
      getParentSignature(
        submission
      ),
  };
}


function isValidLiveWaiverSubmission(
  submission
) {
  const formId =
    String(
      submission?.form_id ||
      submission?.formID ||
      ''
    ).trim();

  if (
    formId &&
    formId !==
      JOTFORM_FORM_ID
  ) {
    return false;
  }

  const status =
    String(
      submission?.status ||
      ''
    )
      .trim()
      .toUpperCase();

  if (
    status &&
    status !== 'ACTIVE'
  ) {
    return false;
  }

  return true;
}


function isMatchingMembershipWaiver(
  submission,
  contact
) {
  if (
    !isValidLiveWaiverSubmission(
      submission
    )
  ) {
    return false;
  }

  const waiver =
    getWaiverData(
      submission
    );

  if (
    !isMembershipActivity(
      waiver.activity
    )
  ) {
    return false;
  }

  /*
   * 13U athletes are minors.
   * Never activate membership
   * without the required parent /
   * legal guardian signature.
   */
  if (
    !String(
      waiver.parentSignature ||
      ''
    ).trim()
  ) {
    return false;
  }

  /*
   * Athlete name must match exactly
   * after normalization.
   */
  const athleteMatches =
    Boolean(
      normalizeIdentity(
        waiver.athleteName
      )
    ) &&
    Boolean(
      normalizeIdentity(
        contact.playerName
      )
    ) &&
    normalizeIdentity(
      waiver.athleteName
    ) ===
      normalizeIdentity(
        contact.playerName
      );

  if (
    !athleteMatches
  ) {
    return false;
  }

  /*
   * Require at least one additional
   * identity match:
   *
   * - payer email
   * - parent/legal guardian name
   * - phone number
   */
  const emailMatches =
    Boolean(
      normalizeEmail(
        waiver.email
      )
    ) &&
    Boolean(
      normalizeEmail(
        contact.email
      )
    ) &&
    normalizeEmail(
      waiver.email
    ) ===
      normalizeEmail(
        contact.email
      );

  const guardianMatches =
    Boolean(
      normalizeIdentity(
        waiver.guardianName
      )
    ) &&
    Boolean(
      normalizeIdentity(
        contact
          .parentGuardianName
      )
    ) &&
    normalizeIdentity(
      waiver.guardianName
    ) ===
      normalizeIdentity(
        contact
          .parentGuardianName
      );

  const phoneMatches =
    Boolean(
      normalizePhone(
        waiver.phone
      )
    ) &&
    Boolean(
      normalizePhone(
        contact.phone
      )
    ) &&
    normalizePhone(
      waiver.phone
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
      '13U Jotform waiver lookup unavailable: JOTFORM_API_KEY is not configured'
    );

    return {
      lookupStatus:
        'unavailable',

      match:
        null,
    };
  }

  try {
    const response =
      await fetch(
        `https://api.jotform.com/form/${JOTFORM_FORM_ID}/submissions?limit=1000&orderby=created_at&direction=DESC`,
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

    const responseText =
      await response.text();

    if (!response.ok) {
      console.error(
        '13U Jotform waiver lookup failed',
        {
          status:
            response.status,

          response:
            responseText.slice(
              0,
              500
            ),
        }
      );

      return {
        lookupStatus:
          'error',

        match:
          null,
      };
    }

    let body;

    try {
      body =
        JSON.parse(
          responseText
        );
    } catch {
      console.error(
        '13U Jotform waiver lookup returned invalid JSON'
      );

      return {
        lookupStatus:
          'error',

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

      match,
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
        'error',

      match:
        null,
    };
  }
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
    !process.env
      .RESEND_API_KEY
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

  if (
    !response.ok
  ) {
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


async function sendInitialPaymentEmails(
  session,
  event
) {
  if (
    !is13UCheckout(
      session
    )
  ) {
    return;
  }

  const contact =
    getCheckoutContact(
      session
    );

  const metadata =
    session.metadata ||
    {};

  const paymentOption =
    metadata.payment_option ||
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

  const memberCardUrl =
    getMemberCardUrl(
      session.id
    );

  /*
   * Parent/card emails use the same
   * strict current-waiver verification
   * as membership activation.
   */
  const waiverComplete =
    hasCurrentCompletedWaiverMetadata(
      metadata,
      contact.playerName
    );

  const waiverLookupStatus =
    metadata
      .waiver_lookup_status ||
    'unknown';

  const membershipStatus =
    waiverComplete
      ? 'ACTIVE'
      : 'PENDING — ATHLETE WAIVER REQUIRED';

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

Membership Status: ${membershipStatus}
Waiver Status: ${waiverComplete ? 'Verified' : 'Required'}
Waiver Lookup: ${waiverLookupStatus}

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
        <strong>Membership Status:</strong>
        ${escapeHtml(
          membershipStatus
        )}
      </p>

      <p>
        <strong>Waiver Status:</strong>
        ${waiverComplete
          ? 'Verified'
          : 'Required'}
      </p>

      <p>
        <strong>Waiver Lookup:</strong>
        ${escapeHtml(
          waiverLookupStatus
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

  if (
    !contact.email
  ) {
    console.warn(
      '13U parent payment email skipped: no payer email',
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
   * PAYMENT + CURRENT LIVE WAIVER
   * ALREADY VERIFIED
   */
  if (
    waiverComplete
  ) {
    const subject =
      `${contact.playerName || '13U Academy Athlete'} — ` +
      'Your CYOJ Hit Lab Digital Membership Card Is Active';

    const text = `
CYOJ Hit Lab 2027 13U Baseball Academy

Payment has been confirmed for ${contact.playerName || 'your athlete'} and the required CYOJ Hit Lab Athlete Waiver has been verified.

The digital Academy membership card is active:

${memberCardUrl}

Membership Period:
August 1, 2026 – August 1, 2027

Questions:
support@cyojhitlab.com
`;

    const html = `
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
          </strong>

          and the required CYOJ Hit Lab
          Athlete Waiver has been verified.
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

        <p>
          <strong>
            Membership Period:
          </strong>
          <br>
          August 1, 2026 – August 1, 2027
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

      subject,

      html,

      text,

      eventId:
        event.id,

      purpose:
        'membership-card-active',
    });

    return;
  }

  /*
   * PAYMENT COMPLETE BUT CURRENT
   * LIVE WAIVER STILL REQUIRED
   */
  const subject =
    `${contact.playerName || '13U Academy Athlete'} — ` +
    'Payment Confirmed · Athlete Waiver Required';

  const text = `
CYOJ Hit Lab 2027 13U Baseball Academy

Payment has been confirmed for ${contact.playerName || 'your athlete'}.

Before the athlete's CYOJ Hit Lab membership card can become active, the required CYOJ Hit Lab Athlete Waiver must be completed and verified.

Complete Athlete Waiver:
${JOTFORM_WAIVER_URL}

Membership Status:
${memberCardUrl}

Once the matching membership waiver is verified, the digital membership card will become active.

Questions:
support@cyojhitlab.com
`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">

      <p style="color:#0d7a3b;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;">
        CYOJ Hit Lab · 2027 13U Baseball Academy
      </p>

      <h2>
        Payment Confirmed · Athlete Waiver Required
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
        Before the athlete's CYOJ Hit Lab
        membership card can become active,
        the required CYOJ Hit Lab Athlete
        Waiver must be completed and verified.
      </p>

      <p style="margin:28px 0;">

        <a
          href="${escapeHtml(
            JOTFORM_WAIVER_URL
          )}"
          style="display:inline-block;background:#37cf73;color:#051009;text-decoration:none;font-weight:bold;padding:14px 20px;"
        >
          Complete Athlete Waiver
        </a>

      </p>

      <p>
        <strong>
          Membership Status:
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

      <p style="font-size:12px;color:#6b7280;">
        Once the matching membership waiver
        is verified, the same membership
        link will show the active digital card.
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

    subject,

    html,

    text,

    eventId:
      event.id,

    purpose:
      'waiver-required',
  });
}


async function sendInitialPaymentFailureEmail(
  session,
  event
) {
  if (
    !is13UCheckout(
      session
    )
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


async function getCustomerContact(
  stripe,
  customerValue
) {
  const customerId =
    getId(
      customerValue
    );

  if (
    !customerId
  ) {
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

  if (
    customer.deleted
  ) {
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
          `${formatCurrency(
            amount
          )}`
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
   STRIPE RECORD UPDATES
   ========================================================= */


async function recordSuccessfulCheckout(
  stripe,
  session,
  eventCreated
) {
  if (
    !is13UCheckout(
      session
    )
  ) {
    return;
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

  const existingCustomer =
    await stripe.customers
      .retrieve(
        customerId
      );

  const existingCustomerMetadata =
    existingCustomer.deleted
      ? {}
      : (
          existingCustomer.metadata ||
          {}
        );

  const sessionMetadata =
    session.metadata ||
    {};

  /*
   * Do NOT trust a generic
   * waiver_status=completed value.
   *
   * The stored verification must:
   *
   * - belong to the current LIVE form
   * - contain a real submission ID
   * - belong to this athlete
   */
  const sessionWaiverVerified =
    hasCurrentCompletedWaiverMetadata(
      sessionMetadata,
      contact.playerName
    );

  const customerWaiverVerified =
    hasCurrentCompletedWaiverMetadata(
      existingCustomerMetadata,
      contact.playerName
    );

  const previouslyVerified =
    sessionWaiverVerified ||
    customerWaiverVerified;

  let waiverComplete =
    previouslyVerified;

  let waiverLookupStatus =
    previouslyVerified
      ? 'already_verified'
      : 'not_checked';

  /*
   * Only preserve a prior submission
   * ID when that prior waiver record
   * actually passed current-form and
   * same-athlete verification.
   */
  let waiverSubmissionId =
    sessionWaiverVerified
      ? String(
          sessionMetadata
            .waiver_submission_id ||
          ''
        )
      : customerWaiverVerified
        ? String(
            existingCustomerMetadata
              .waiver_submission_id ||
            ''
          )
        : '';

  /*
   * If Stripe does not already contain
   * a proven current waiver, query the
   * current LIVE Jotform waiver.
   */
  if (
    !waiverComplete
  ) {
    const waiverLookup =
      await findExistingMembershipWaiver(
        contact
      );

    waiverLookupStatus =
      waiverLookup
        .lookupStatus;

    if (
      waiverLookup.match
    ) {
      waiverComplete =
        true;

      waiverSubmissionId =
        String(
          waiverLookup
            .match
            .id ||
          ''
        );
    }
  }

  const membershipStatus =
    waiverComplete
      ? 'active'
      : 'waiver_required';

  const existingIssuedAt =
    sessionWaiverVerified
      ? (
          sessionMetadata
            .membership_card_issued_at ||
          ''
        )
      : customerWaiverVerified
        ? (
            existingCustomerMetadata
              .membership_card_issued_at ||
            ''
          )
        : '';

  const existingVerifiedAt =
    sessionWaiverVerified
      ? (
          sessionMetadata
            .waiver_verified_at ||
          ''
        )
      : customerWaiverVerified
        ? (
            existingCustomerMetadata
              .waiver_verified_at ||
            ''
          )
        : '';

  const metadata = {
    ...sessionMetadata,

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

    membership_status:
      membershipStatus,

    enrollment_status:
      isInstallment
        ? 'initial_payment_received'
        : 'paid_in_full',

    waiver_form_id:
      JOTFORM_FORM_ID,

    /*
     * Empty string removes a stale
     * Stripe metadata value when the
     * current waiver has not been proven.
     */
    waiver_submission_id:
      waiverComplete
        ? waiverSubmissionId
        : '',

    waiver_status:
      waiverComplete
        ? 'completed'
        : 'required',

    hit_lab_waiver_status:
      waiverComplete
        ? 'completed'
        : 'required',

    waiver_lookup_status:
      waiverLookupStatus,

    waiver_verified_at:
      waiverComplete
        ? (
            existingVerifiedAt ||
            paymentReceivedAt
          )
        : '',

    membership_card_issued_at:
      waiverComplete
        ? (
            existingIssuedAt ||
            paymentReceivedAt
          )
        : '',
  };

  const customerUpdate = {
    name:
      contact.parentGuardianName,

    metadata,
  };

  if (
    contact.email
  ) {
    customerUpdate.email =
      contact.email;
  }

  if (
    contact.phone
  ) {
    customerUpdate.phone =
      contact.phone;
  }

  /*
   * INSTALLMENT PLAN ONLY
   *
   * Save the successful initial
   * payment method as the customer's
   * default payment method for the
   * November and February charges.
   */
  if (
    isInstallment
  ) {
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

    if (
      !paymentMethodId
    ) {
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

  if (
    invoiceId
  ) {
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

  /*
   * Keep the in-memory Session
   * synchronized so the email sent
   * immediately afterward uses the
   * newly verified waiver status.
   */
  session.metadata =
    metadata;
}


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

  if (
    !customerId
  ) {
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

  const customer =
    await stripe.customers
      .retrieve(
        customerId
      );

  const customerMetadata =
    customer.deleted
      ? {}
      : (
          customer.metadata ||
          {}
        );

  /*
   * A successful installment may
   * restore payment standing, but
   * ONLY a completed waiver from the
   * current LIVE form can restore
   * active membership access.
   */
  const waiverComplete =
    hasCurrentCompletedWaiverMetadata(
      customerMetadata,
      customerMetadata
        .player_name ||
      ''
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
            waiverComplete
              ? 'active'
              : 'waiver_required',
        },
      }
    ),
  ]);
}


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

  if (
    !customerId
  ) {
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
   STRIPE WEBHOOK HANDLER
   ========================================================= */


export default async function handler(
  req,
  res
) {
  if (
    req.method !==
      'POST'
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

  if (
    !signature
  ) {
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
        await recordSuccessfulCheckout(
          stripe,
          session,
          event.created
        );

        await sendInitialPaymentEmails(
          session,
          event
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
        await recordSuccessfulCheckout(
          stripe,
          session,
          event.created
        );

        await sendInitialPaymentEmails(
          session,
          event
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
