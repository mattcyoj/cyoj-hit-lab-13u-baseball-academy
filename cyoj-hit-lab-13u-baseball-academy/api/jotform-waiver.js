import Stripe from 'stripe';
import crypto from 'crypto';

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

const JOTFORM_FORM_ID =
  '262305529358158';

const JOTFORM_PARENT_SIGNATURE_FIELD_ID =
  '66';

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';

const NOTIFICATION_FROM =
  'CYOJ Hit Lab Payments <payments@notifications.cyojhitlabacademy.com>';

const INTERNAL_EMAIL =
  'support@cyojhitlab.com';


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
      .map(answerToText)
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
      return nameParts.join(' ');
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
      return phoneParts.join('');
    }

    return Object.values(value)
      .map(answerToText)
      .filter(Boolean)
      .join(' ');
  }

  return '';
}


/* =========================================================
   RAW WEBHOOK BODY
   ========================================================= */


async function getRawBody(req) {
  const chunks = [];

  for await (
    const chunk of req
  ) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(
    chunks
  );
}


/*
 * Multipart boundaries are case-sensitive.
 *
 * IMPORTANT:
 * Never lowercase the complete Content-Type
 * string before extracting the boundary.
 */
function parseMultipart(
  rawText,
  contentType
) {
  const result = {};

  const boundaryMatch =
    String(
      contentType || ''
    ).match(
      /boundary=(?:"([^"]+)"|([^;]+))/i
    );

  if (!boundaryMatch) {
    return result;
  }

  const boundary =
    String(
      boundaryMatch[1] ||
      boundaryMatch[2] ||
      ''
    ).trim();

  if (!boundary) {
    return result;
  }

  const delimiter =
    `--${boundary}`;

  const parts =
    rawText.split(
      delimiter
    );

  for (
    const rawPart of parts
  ) {
    let part =
      rawPart;

    if (
      !part ||
      part === '--' ||
      part === '--\r\n'
    ) {
      continue;
    }

    if (
      part.startsWith(
        '\r\n'
      )
    ) {
      part =
        part.slice(2);
    }

    if (
      part.endsWith(
        '\r\n'
      )
    ) {
      part =
        part.slice(
          0,
          -2
        );
    }

    if (
      part.endsWith(
        '--'
      )
    ) {
      part =
        part.slice(
          0,
          -2
        );
    }

    const headerEnd =
      part.indexOf(
        '\r\n\r\n'
      );

    if (
      headerEnd === -1
    ) {
      continue;
    }

    const headersText =
      part.slice(
        0,
        headerEnd
      );

    const value =
      part
        .slice(
          headerEnd + 4
        )
        .replace(
          /\r\n$/,
          ''
        );

    const nameMatch =
      headersText.match(
        /content-disposition:[^\r\n]*\bname="([^"]+)"/i
      );

    if (!nameMatch) {
      continue;
    }

    const fieldName =
      nameMatch[1];

    result[fieldName] =
      value;
  }

  return result;
}


function parseWebhookBody(
  rawBody,
  contentType
) {
  const rawText =
    rawBody.toString(
      'utf8'
    );

  /*
   * Use a lowercased copy ONLY
   * to identify the media type.
   *
   * Keep the original Content-Type
   * untouched for multipart boundary
   * extraction.
   */
  const originalContentType =
    String(
      contentType || ''
    );

  const normalizedType =
    originalContentType
      .toLowerCase();

  if (
    normalizedType.includes(
      'application/json'
    )
  ) {
    try {
      return JSON.parse(
        rawText
      );
    } catch {
      return {};
    }
  }

  if (
    normalizedType.includes(
      'multipart/form-data'
    )
  ) {
    return parseMultipart(
      rawText,
      originalContentType
    );
  }

  try {
    return Object.fromEntries(
      new URLSearchParams(
        rawText
      )
    );
  } catch {
    return {};
  }
}


function extractSubmissionId(
  payload
) {
  if (
    !payload ||
    typeof payload !==
      'object'
  ) {
    return '';
  }

  const direct =
    payload.submissionID ||
    payload.submissionId ||
    payload.submission_id ||
    '';

  if (direct) {
    return String(
      direct
    ).trim();
  }

  const rawRequest =
    payload.rawRequest;

  if (!rawRequest) {
    return '';
  }

  if (
    typeof rawRequest ===
      'object'
  ) {
    return String(
      rawRequest.submissionID ||
      rawRequest.submissionId ||
      rawRequest.submission_id ||
      ''
    ).trim();
  }

  try {
    const parsed =
      JSON.parse(
        rawRequest
      );

    return String(
      parsed.submissionID ||
      parsed.submissionId ||
      parsed.submission_id ||
      ''
    ).trim();

  } catch {
    return '';
  }
}


/* =========================================================
   WEBHOOK SECRET
   ========================================================= */


function secretsMatch(
  receivedSecret,
  expectedSecret
) {
  const received =
    Buffer.from(
      String(
        receivedSecret || ''
      )
    );

  const expected =
    Buffer.from(
      String(
        expectedSecret || ''
      )
    );

  if (
    received.length === 0 ||
    expected.length === 0 ||
    received.length !==
      expected.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    received,
    expected
  );
}


/* =========================================================
   JOTFORM
   ========================================================= */


async function fetchJotformSubmission(
  submissionId
) {
  const apiKey =
    String(
      process.env
        .JOTFORM_API_KEY ||
      ''
    ).trim();

  if (!apiKey) {
    throw new Error(
      'JOTFORM_API_KEY is not configured'
    );
  }

  const response =
    await fetch(
      `https://api.jotform.com/submission/${encodeURIComponent(
        submissionId
      )}`,
      {
        method: 'GET',

        headers: {
          APIKEY:
            apiKey,

          Accept:
            'application/json',
        },
      }
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Jotform submission lookup failed (${response.status}): ${text.slice(
        0,
        500
      )}`
    );
  }

  let body;

  try {
    body =
      JSON.parse(
        text
      );
  } catch {
    throw new Error(
      'Jotform returned invalid JSON'
    );
  }

  if (
    !body?.content
  ) {
    throw new Error(
      'Jotform submission response did not contain submission content'
    );
  }

  return body.content;
}


function getAnswersMap(
  submission
) {
  let answers =
    submission?.answers;

  if (
    typeof answers ===
      'string'
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
      'object'
  ) {
    return {};
  }

  return answers;
}


function getAnswerObjects(
  submission
) {
  return Object.values(
    getAnswersMap(
      submission
    )
  ).filter(Boolean);
}


function getAnswerObjectByLabel(
  submission,
  labels
) {
  const normalizedLabels =
    labels.map(
      normalizeQuestionText
    );

  return (
    getAnswerObjects(
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


function getAnswerTextByLabel(
  submission,
  labels
) {
  const answerObject =
    getAnswerObjectByLabel(
      submission,
      labels
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
 * LIVE Jotform parent/legal guardian
 * signature field.
 *
 * Exact field ID 66 is checked first.
 * Question-label matching remains as
 * a fallback if the form changes later.
 */
function getParentSignature(
  submission
) {
  const answers =
    getAnswersMap(
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

  return getAnswerTextByLabel(
    submission,
    [
      'Parent/Legal Guardian Signature (Required if Participant / Athlete is under 18)',

      'Parent / Legal Guardian Signature (Required if Participant / Athlete is under 18)',

      'Parent/Guardian Signature (Required if under 18)',

      'Parent/Legal Guardian Signature (Required if under 18)',

      'Parent / Legal Guardian Signature (Required if under 18)',
    ]
  );
}


function getWaiverData(
  submission
) {
  return {
    athleteName:
      getAnswerTextByLabel(
        submission,
        [
          'Participant / Athlete Full Name',
        ]
      ),

    guardianName:
      getAnswerTextByLabel(
        submission,
        [
          'Parent/Legal Guardian Name',
          'Parent / Legal Guardian Name',
        ]
      ),

    email:
      getAnswerTextByLabel(
        submission,
        [
          'Email Address of Person Completing This Form',
        ]
      ),

    phone:
      getAnswerTextByLabel(
        submission,
        [
          'Phone Number of Person Completing This Form',
        ]
      ),

    activity:
      getAnswerTextByLabel(
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


/* =========================================================
   STRIPE CUSTOMER MATCHING
   ========================================================= */


function isPaid13UCustomer(
  customer
) {
  if (
    !customer ||
    customer.deleted
  ) {
    return false;
  }

  const metadata =
    customer.metadata ||
    {};

  return (
    metadata.team ===
      TEAM &&

    (
      metadata.team_code ===
        TEAM_CODE ||
      metadata.program ===
        PROGRAM
    ) &&

    String(
      metadata
        .initial_payment_status ||
      ''
    )
      .trim()
      .toLowerCase() ===
        'paid'
  );
}


function customerMatchesWaiver(
  customer,
  waiver
) {
  if (
    !isPaid13UCustomer(
      customer
    )
  ) {
    return false;
  }

  const metadata =
    customer.metadata ||
    {};

  const athleteMatches =
    Boolean(
      normalizeIdentity(
        waiver.athleteName
      )
    ) &&
    Boolean(
      normalizeIdentity(
        metadata.player_name
      )
    ) &&
    normalizeIdentity(
      waiver.athleteName
    ) ===
      normalizeIdentity(
        metadata.player_name
      );

  if (!athleteMatches) {
    return false;
  }

  const emailMatches =
    Boolean(
      normalizeEmail(
        waiver.email
      )
    ) &&
    Boolean(
      normalizeEmail(
        customer.email
      )
    ) &&
    normalizeEmail(
      waiver.email
    ) ===
      normalizeEmail(
        customer.email
      );

  const guardianMatches =
    Boolean(
      normalizeIdentity(
        waiver.guardianName
      )
    ) &&
    Boolean(
      normalizeIdentity(
        metadata
          .parent_guardian_name
      )
    ) &&
    normalizeIdentity(
      waiver.guardianName
    ) ===
      normalizeIdentity(
        metadata
          .parent_guardian_name
      );

  const phoneMatches =
    Boolean(
      normalizePhone(
        waiver.phone
      )
    ) &&
    Boolean(
      normalizePhone(
        customer.phone
      )
    ) &&
    normalizePhone(
      waiver.phone
    ) ===
      normalizePhone(
        customer.phone
      );

  return (
    emailMatches ||
    guardianMatches ||
    phoneMatches
  );
}


async function findMatchingPaid13UCustomer(
  stripe,
  waiver
) {
  const matches =
    new Map();

  if (
    normalizeEmail(
      waiver.email
    )
  ) {
    const emailPage =
      await stripe.customers
        .list({
          email:
            normalizeEmail(
              waiver.email
            ),

          limit:
            100,
        });

    for (
      const customer of
      emailPage.data
    ) {
      if (
        customerMatchesWaiver(
          customer,
          waiver
        )
      ) {
        matches.set(
          customer.id,
          customer
        );
      }
    }

    if (
      matches.size === 1
    ) {
      return {
        status:
          'matched',

        customer:
          [...matches.values()][0],
      };
    }

    if (
      matches.size > 1
    ) {
      return {
        status:
          'ambiguous',

        customer:
          null,
      };
    }
  }

  let startingAfter =
    undefined;

  for (
    let pageNumber = 0;
    pageNumber < 5;
    pageNumber += 1
  ) {
    const page =
      await stripe.customers
        .list({
          limit:
            100,

          ...(startingAfter
            ? {
                starting_after:
                  startingAfter,
              }
            : {}),
        });

    for (
      const customer of
      page.data
    ) {
      if (
        customerMatchesWaiver(
          customer,
          waiver
        )
      ) {
        matches.set(
          customer.id,
          customer
        );
      }
    }

    if (
      !page.has_more ||
      page.data.length === 0
    ) {
      break;
    }

    startingAfter =
      page.data[
        page.data.length - 1
      ].id;
  }

  if (
    matches.size === 0
  ) {
    return {
      status:
        'not_found',

      customer:
        null,
    };
  }

  if (
    matches.size > 1
  ) {
    return {
      status:
        'ambiguous',

      customer:
        null,
    };
  }

  return {
    status:
      'matched',

    customer:
      [...matches.values()][0],
  };
}


/* =========================================================
   RESEND EMAIL
   ========================================================= */


async function sendResendEmail({
  to,
  subject,
  html,
  text,
  idempotencyKey,
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
            idempotencyKey,
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

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Resend email failed (${response.status}): ${responseText}`
    );
  }
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


async function sendActivationEmails({
  customer,
  waiver,
  submissionId,
  sessionId,
}) {
  if (!sessionId) {
    return;
  }

  const cardUrl =
    getMemberCardUrl(
      sessionId
    );

  const playerName =
    waiver.athleteName ||
    customer.metadata
      ?.player_name ||
    '13U Academy Athlete';

  const parentEmail =
    customer.email ||
    waiver.email ||
    '';

  if (parentEmail) {
    await sendResendEmail({
      to:
        parentEmail,

      subject:
        `${playerName} — Your CYOJ Hit Lab Digital Membership Card Is Active`,

      text: `
CYOJ Hit Lab 2027 13U Baseball Academy

The required CYOJ Hit Lab Athlete Waiver has been verified for ${playerName}.

Payment has already been confirmed, so the athlete's digital membership card is now active.

Open Digital Membership Card:
${cardUrl}

Membership Period:
August 1, 2026 – August 1, 2027

Questions:
support@cyojhitlab.com
`,

      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">

          <p style="color:#0d7a3b;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;">
            CYOJ Hit Lab · 2027 13U Baseball Academy
          </p>

          <h2>
            Your Digital Membership Card Is Active
          </h2>

          <p>
            The required CYOJ Hit Lab Athlete Waiver has been verified for
            <strong>${escapeHtml(
              playerName
            )}</strong>.
          </p>

          <p>
            Payment has already been confirmed, so the athlete's digital membership card is now active.
          </p>

          <p style="margin:28px 0;">

            <a
              href="${escapeHtml(
                cardUrl
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
      `,

      idempotencyKey:
        `13u/waiver-active-parent/${submissionId}`,
    });
  }

  await sendResendEmail({
    to:
      INTERNAL_EMAIL,

    subject:
      `13U Membership Activated — ${playerName}`,

    text: `
CYOJ Hit Lab 2027 13U Baseball Academy

A previously paid 13U athlete has completed the required membership waiver.

Player:
${playerName}

Parent/Guardian:
${waiver.guardianName || customer.metadata?.parent_guardian_name || 'Not provided'}

Email:
${parentEmail || 'Not provided'}

Jotform Submission:
${submissionId}

Stripe Customer:
${customer.id}

Digital Membership Card:
${cardUrl}
`,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">

        <h2>
          13U Membership Activated
        </h2>

        <p>
          <strong>Player:</strong>
          ${escapeHtml(
            playerName
          )}
        </p>

        <p>
          <strong>Parent/Guardian:</strong>
          ${escapeHtml(
            waiver.guardianName ||
            customer.metadata
              ?.parent_guardian_name ||
            'Not provided'
          )}
        </p>

        <p>
          <strong>Email:</strong>
          ${escapeHtml(
            parentEmail ||
            'Not provided'
          )}
        </p>

        <p>
          <strong>Jotform Submission:</strong>
          ${escapeHtml(
            submissionId
          )}
        </p>

        <p>
          <strong>Stripe Customer:</strong>
          ${escapeHtml(
            customer.id
          )}
        </p>

        <p>
          <a href="${escapeHtml(
            cardUrl
          )}">
            Open Digital Membership Card
          </a>
        </p>

      </div>
    `,

    idempotencyKey:
      `13u/waiver-active-internal/${submissionId}`,
  });
}


/* =========================================================
   STRIPE WAIVER ACTIVATION
   ========================================================= */


async function activateMembershipFromWaiver({
  stripe,
  customer,
  waiver,
  submissionId,
}) {
  const existingMetadata =
    customer.metadata ||
    {};

  const verifiedAt =
    new Date().toISOString();

  const paymentAttentionRequired =
    existingMetadata
      .membership_status ===
        'payment_attention_required' ||
    existingMetadata
      .enrollment_status ===
        'payment_attention_required';

  const membershipStatus =
    paymentAttentionRequired
      ? 'payment_attention_required'
      : 'active';

  const sessionId =
    existingMetadata
      .initial_checkout_session_id ||
    existingMetadata
      .membership_card_session_id ||
    '';

  const paymentIntentId =
    existingMetadata
      .initial_payment_intent_id ||
    '';

  const metadata = {
    ...existingMetadata,

    waiver_form_id:
      JOTFORM_FORM_ID,

    waiver_submission_id:
      submissionId,

    waiver_status:
      'completed',

    hit_lab_waiver_status:
      'completed',

    waiver_lookup_status:
      'matched',

    waiver_verified_at:
      existingMetadata
        .waiver_verified_at ||
      verifiedAt,

    membership_status:
      membershipStatus,
  };

  if (
    membershipStatus ===
      'active'
  ) {
    metadata
      .membership_card_issued_at =
        existingMetadata
          .membership_card_issued_at ||
        verifiedAt;
  }

  const updates = [
    stripe.customers.update(
      customer.id,
      {
        metadata,
      }
    ),
  ];

  if (sessionId) {
    updates.push(
      stripe.checkout.sessions
        .update(
          sessionId,
          {
            metadata,
          }
        )
    );
  }

  if (paymentIntentId) {
    updates.push(
      stripe.paymentIntents
        .update(
          paymentIntentId,
          {
            metadata,
          }
        )
    );
  }

  await Promise.all(
    updates
  );

  if (
    membershipStatus ===
      'active'
  ) {
    await sendActivationEmails({
      customer,
      waiver,
      submissionId,
      sessionId,
    });
  }

  return {
    membershipStatus,
    sessionId,
  };
}


/* =========================================================
   HANDLER
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

  const expectedSecret =
    String(
      process.env
        .JOTFORM_WEBHOOK_SECRET ||
      ''
    );

  const receivedSecret =
    String(
      req.query?.secret ||
      ''
    );

  if (!expectedSecret) {
    return res
      .status(500)
      .json({
        error:
          'Jotform webhook secret is not configured',
      });
  }

  if (
    !secretsMatch(
      receivedSecret,
      expectedSecret
    )
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

  try {
    const rawBody =
      await getRawBody(
        req
      );

    const payload =
      parseWebhookBody(
        rawBody,
        req.headers[
          'content-type'
        ]
      );

    const submissionId =
      extractSubmissionId(
        payload
      );

    if (!submissionId) {
      return res
        .status(400)
        .json({
          error:
            'Missing Jotform submission ID',
        });
    }

    const submission =
      await fetchJotformSubmission(
        submissionId
      );

    if (
      !isValidLiveWaiverSubmission(
        submission
      )
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            'not_live_waiver_submission',
        });
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
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            'not_membership',
        });
    }

    if (
      !String(
        waiver.athleteName ||
        ''
      ).trim()
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            'athlete_name_missing',
        });
    }

    if (
      !String(
        waiver.parentSignature ||
        ''
      ).trim()
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            'required_signature_missing',
        });
    }

    const stripe =
      getStripe();

    const match =
      await findMatchingPaid13UCustomer(
        stripe,
        waiver
      );

    if (
      match.status ===
        'not_found'
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          matched:
            false,

          reason:
            'no_paid_13u_match',
        });
    }

    if (
      match.status ===
        'ambiguous'
    ) {
      console.error(
        '13U Jotform waiver customer match is ambiguous',
        {
          submissionId,

          athleteName:
            waiver.athleteName,
        }
      );

      return res
        .status(200)
        .json({
          received:
            true,

          matched:
            false,

          reason:
            'ambiguous_paid_13u_match',
        });
    }

    const customer =
      match.customer;

    if (
      String(
        customer.metadata
          ?.waiver_submission_id ||
        ''
      ) === submissionId &&
      [
        'completed',
        'verified',
      ].includes(
        String(
          customer.metadata
            ?.waiver_status ||
          ''
        )
          .trim()
          .toLowerCase()
      )
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          matched:
            true,

          duplicate:
            true,

          customer:
            customer.id,
        });
    }

    const activation =
      await activateMembershipFromWaiver({
        stripe,
        customer,
        waiver,
        submissionId,
      });

    return res
      .status(200)
      .json({
        received:
          true,

        matched:
          true,

        activated:
          activation
            .membershipStatus ===
              'active',

        membership_status:
          activation
            .membershipStatus,

        customer:
          customer.id,
      });

  } catch (error) {
    console.error(
      '13U Jotform waiver webhook failed',
      {
        message:
          error.message,
      }
    );

    return res
      .status(500)
      .json({
        error:
          'Jotform waiver webhook processing failed',
      });
  }
}
