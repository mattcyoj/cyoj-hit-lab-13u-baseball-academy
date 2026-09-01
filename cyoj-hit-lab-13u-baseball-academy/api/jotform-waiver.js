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

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';

const NOTIFICATION_FROM =
  'CYOJ Hit Lab Payments <payments@notifications.cyojhitlabacademy.com>';

const NOTIFICATION_TO =
  'support@cyojhitlab.com';


/* =========================================================
   GENERAL HELPERS
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


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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


function safeSecretMatch(
  received,
  expected
) {
  const receivedBuffer =
    Buffer.from(
      String(received || '')
    );

  const expectedBuffer =
    Buffer.from(
      String(expected || '')
    );

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    receivedBuffer,
    expectedBuffer
  );
}


/* =========================================================
   RAW JOTFORM WEBHOOK
   ========================================================= */

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer
    .concat(chunks)
    .toString('utf8');
}


function extractMultipartField(
  rawBody,
  fieldName
) {
  const escapedName =
    String(fieldName)
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

  const expression =
    new RegExp(
      `name="${escapedName}"[\\s\\S]*?\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n--|$)`
    );

  const match =
    rawBody.match(
      expression
    );

  if (!match) {
    return '';
  }

  return String(
    match[1] || ''
  ).trim();
}


function getWebhookField({
  rawBody,
  contentType,
  fieldName,
}) {
  if (
    contentType.includes(
      'application/x-www-form-urlencoded'
    )
  ) {
    const params =
      new URLSearchParams(
        rawBody
      );

    return String(
      params.get(
        fieldName
      ) || ''
    ).trim();
  }


  if (
    contentType.includes(
      'application/json'
    )
  ) {
    try {
      const parsed =
        JSON.parse(
          rawBody
        );

      return String(
        parsed?.[fieldName] ||
        ''
      ).trim();

    } catch {
      return '';
    }
  }


  return extractMultipartField(
    rawBody,
    fieldName
  );
}


function getSubmissionIdFromWebhook({
  rawBody,
  contentType,
}) {
  const directSubmissionId =
    getWebhookField({
      rawBody,
      contentType,
      fieldName:
        'submissionID',
    });

  if (directSubmissionId) {
    return directSubmissionId;
  }


  const rawRequest =
    getWebhookField({
      rawBody,
      contentType,
      fieldName:
        'rawRequest',
    });


  if (!rawRequest) {
    return '';
  }


  try {
    const parsed =
      JSON.parse(
        rawRequest
      );

    return String(
      parsed?.id ||
      parsed?.submissionID ||
      ''
    ).trim();

  } catch {
    return '';
  }
}


/* =========================================================
   JOTFORM API
   ========================================================= */

async function getJotformSubmission(
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
    throw new Error(
      `Jotform submission lookup failed (${response.status})`
    );
  }


  let body;


  try {
    body =
      JSON.parse(
        responseText
      );

  } catch {
    throw new Error(
      'Jotform submission lookup returned invalid JSON'
    );
  }


  const submission =
    body?.content;


  if (
    !submission ||
    typeof submission !==
      'object'
  ) {
    throw new Error(
      'Jotform submission was not returned'
    );
  }


  return submission;
}


/* =========================================================
   JOTFORM ANSWER HELPERS
   ========================================================= */

function getSubmissionAnswers(
  submission
) {
  const answers =
    submission?.answers;

  if (
    !answers ||
    typeof answers !==
      'object'
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


function answerToText(
  value
) {
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
      typeof value.full ===
      'string'
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


    if (nameParts.length) {
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


    if (phoneParts.length) {
      return phoneParts
        .join('');
    }


    return Object.values(
      value
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
    answerObject.answer
  );
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
      getAnswerText(
        submission,
        [
          'Parent/Legal Guardian Signature (Required if under 18)',
          'Parent / Legal Guardian Signature (Required if under 18)',
          'Parent/Guardian Signature (Required if under 18)',
          'Parent/Legal Guardian Signature (Required if Participant / Athlete is under 18)',
        ]
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


/* =========================================================
   STRIPE CUSTOMER MATCHING
   ========================================================= */

function is13UCustomer(
  customer
) {
  const metadata =
    customer?.metadata ||
    {};

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


function customerMatchesWaiver(
  customer,
  waiver
) {
  if (
    !customer ||
    customer.deleted ||
    !is13UCustomer(
      customer
    )
  ) {
    return false;
  }


  const metadata =
    customer.metadata || {};


  /*
   * The initial Academy payment must
   * already have successfully cleared.
   */
  if (
    metadata.initial_payment_status !==
      'paid'
  ) {
    return false;
  }


  const athleteMatches =
    Boolean(
      normalizeIdentity(
        waiver.athleteName
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


  /*
   * Require athlete name plus one
   * additional identity match.
   */

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


async function findPaid13UCustomer(
  stripe,
  waiver
) {
  const matches =
    new Map();


  /*
   * FIRST PASS
   *
   * Exact Stripe email lookup.
   */
  if (
    normalizeEmail(
      waiver.email
    )
  ) {

    const emailCustomers =
      await stripe.customers.list({
        email:
          waiver.email.trim(),

        limit:
          100,
      });


    for (
      const customer
      of emailCustomers.data
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
  }


  /*
   * SECOND PASS
   *
   * If necessary, inspect current
   * customers locally. This lets us
   * still match a legitimate athlete
   * when the parent used a different
   * email address but their guardian
   * name or phone matches.
   *
   * The scan is intentionally capped.
   */
  if (
    matches.size === 0
  ) {

    let startingAfter =
      undefined;

    let pagesChecked =
      0;


    while (
      pagesChecked < 5
    ) {

      const page =
        await stripe.customers.list({
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
        const customer
        of page.data
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

      pagesChecked += 1;
    }
  }


  const uniqueMatches =
    Array.from(
      matches.values()
    );


  /*
   * Never guess between multiple
   * enrollment records.
   */
  if (
    uniqueMatches.length !== 1
  ) {
    return {
      customer:
        null,

      matchCount:
        uniqueMatches.length,
    };
  }


  return {
    customer:
      uniqueMatches[0],

    matchCount:
      1,
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
  submissionId,
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
            `13u/${purpose}/${submissionId}`,
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


/* =========================================================
   ACTIVATE WAIVER STATUS
   ========================================================= */

async function recordVerifiedWaiver({
  stripe,
  customer,
  submissionId,
}) {
  const metadata =
    customer.metadata ||
    {};


  /*
   * Duplicate Jotform deliveries are
   * normal. Do not reissue the card or
   * send another activation email.
   */
  const alreadyRecorded =
    (
      metadata.waiver_status ===
        'completed' ||
      metadata.waiver_status ===
        'verified'
    ) &&
    metadata
      .waiver_submission_id ===
        submissionId;


  if (alreadyRecorded) {
    return {
      alreadyRecorded:
        true,

      membershipActivated:
        metadata.membership_status ===
          'active',

      sessionId:
        metadata
          .initial_checkout_session_id ||
        metadata
          .membership_card_session_id ||
        '',
    };
  }


  const verifiedAt =
    new Date().toISOString();


  const enrollmentStatus =
    String(
      metadata.enrollment_status ||
      ''
    ).trim();


  /*
   * A waiver can be verified while an
   * installment payment requires
   * attention, but that does NOT restore
   * active facility access.
   */
  const paymentAttention =
    enrollmentStatus ===
      'payment_attention_required';


  const membershipStatus =
    paymentAttention
      ? 'payment_attention_required'
      : 'active';


  const sessionId =
    metadata
      .initial_checkout_session_id ||
    metadata
      .membership_card_session_id ||
    '';


  const paymentIntentId =
    metadata
      .initial_payment_intent_id ||
    '';


  const waiverMetadata = {
    waiver_status:
      'completed',

    hit_lab_waiver_status:
      'completed',

    waiver_form_id:
      JOTFORM_FORM_ID,

    waiver_submission_id:
      submissionId,

    waiver_verified_at:
      verifiedAt,

    waiver_lookup_status:
      'matched',

    membership_status:
      membershipStatus,
  };


  if (
    !paymentAttention &&
    !metadata
      .membership_card_issued_at
  ) {
    waiverMetadata
      .membership_card_issued_at =
        verifiedAt;
  }


  await stripe.customers.update(
    customer.id,
    {
      metadata:
        waiverMetadata,
    }
  );


  /*
   * Keep the Checkout Session in sync
   * because it is the permanent record
   * used by the digital membership URL.
   */
  if (sessionId) {

    await stripe.checkout.sessions.update(
      sessionId,
      {
        metadata:
          waiverMetadata,
      }
    );
  }


  /*
   * Keep the initial PaymentIntent
   * metadata synchronized as well.
   */
  if (paymentIntentId) {

    await stripe.paymentIntents.update(
      paymentIntentId,
      {
        metadata:
          waiverMetadata,
      }
    );
  }


  return {
    alreadyRecorded:
      false,

    membershipActivated:
      !paymentAttention,

    sessionId,
  };
}


/* =========================================================
   ACTIVATION EMAILS
   ========================================================= */

async function sendActivationEmails({
  customer,
  waiver,
  submissionId,
  sessionId,
}) {
  if (!sessionId) {
    return;
  }


  const playerName =
    customer.metadata
      ?.player_name ||
    waiver.athleteName ||
    '13U Academy Athlete';


  const cardUrl =
    `${getSiteUrl()}/member/` +
    `${encodeURIComponent(
      sessionId
    )}`;


  /*
   * PARENT / GUARDIAN
   */
  if (customer.email) {

    const parentSubject =
      `${playerName} — Your CYOJ Hit Lab Digital Membership Card Is Active`;


    const parentText = `
CYOJ Hit Lab 2027 13U Baseball Academy

The required CYOJ Hit Lab Athlete Waiver for ${playerName} has been verified.

The athlete's 13U Academy digital membership card is now active.

Open Digital Membership Card:
${cardUrl}

Membership Period:
August 1, 2026 – August 1, 2027

Questions:
support@cyojhitlab.com
`;


    const parentHtml = `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#111827;">

        <p style="color:#0d7a3b;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;">
          CYOJ Hit Lab · 2027 13U Baseball Academy
        </p>

        <h2>
          Digital Membership Card Active
        </h2>

        <p>
          The required CYOJ Hit Lab
          Athlete Waiver for
          <strong>
            ${escapeHtml(
              playerName
            )}
          </strong>
          has been verified.
        </p>

        <p>
          The athlete's 13U Academy
          digital membership card is
          now active.
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
          <strong>Membership Period:</strong>
          <br>
          August 1, 2026 – August 1, 2027
        </p>

        <p style="font-size:12px;color:#6b7280;">
          The QR code on the card opens
          the athlete's live membership
          verification record.
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
        customer.email,

      subject:
        parentSubject,

      html:
        parentHtml,

      text:
        parentText,

      submissionId,

      purpose:
        'waiver-membership-activated',
    });
  }


  /*
   * INTERNAL CONFIRMATION
   */
  const internalSubject =
    `13U Membership Activated — ${playerName}`;


  const internalText = `
CYOJ Hit Lab 13U Baseball Academy Membership Activated

Player:
${playerName}

Parent/Guardian:
${customer.metadata?.parent_guardian_name || waiver.guardianName || 'Not provided'}

Email:
${customer.email || waiver.email || 'Not provided'}

Jotform Submission:
${submissionId}

Stripe Customer:
${customer.id}

Digital Membership Card:
${cardUrl}

Status:
Payment confirmed + Hit Lab Athlete Waiver verified.
`;


  const internalHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#111827;">

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
          customer.metadata
            ?.parent_guardian_name ||
          waiver.guardianName ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Email:</strong>
        ${escapeHtml(
          customer.email ||
          waiver.email ||
          'Not provided'
        )}
      </p>

      <p>
        <strong>Status:</strong>
        Payment confirmed + Hit Lab
        Athlete Waiver verified.
      </p>

      <p>
        <strong>Digital Membership Card:</strong>
        <br>

        <a href="${escapeHtml(
          cardUrl
        )}">
          ${escapeHtml(
            cardUrl
          )}
        </a>
      </p>

      <hr style="border:none;border-top:1px solid #d1d5db;margin:22px 0;">

      <p style="font-size:12px;color:#6b7280;">
        Jotform Submission:
        ${escapeHtml(
          submissionId
        )}
        <br>

        Stripe Customer:
        ${escapeHtml(
          customer.id
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

    submissionId,

    purpose:
      'internal-waiver-membership-activated',
  });
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


  /*
   * This is a separate secret used
   * ONLY for the Jotform webhook URL.
   *
   * Never use the Jotform API key or
   * Stripe key in the webhook URL.
   */
  const expectedSecret =
    String(
      process.env
        .JOTFORM_WEBHOOK_SECRET ||
      ''
    ).trim();


  if (!expectedSecret) {

    console.error(
      '13U Jotform webhook secret is not configured'
    );

    return res
      .status(503)
      .json({
        error:
          'Webhook not configured',
      });
  }


  const receivedSecret =
    Array.isArray(
      req.query?.secret
    )
      ? req.query.secret[0]
      : req.query?.secret;


  if (
    !safeSecretMatch(
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
      .STRIPE_SECRET_KEY ||
    !process.env
      .JOTFORM_API_KEY
  ) {
    return res
      .status(503)
      .json({
        error:
          'Membership verification is not configured',
      });
  }


  try {

    const contentType =
      String(
        req.headers[
          'content-type'
        ] || ''
      ).toLowerCase();


    const rawBody =
      await getRawBody(
        req
      );


    const submissionId =
      getSubmissionIdFromWebhook({
        rawBody,
        contentType,
      });


    if (!submissionId) {

      console.error(
        '13U Jotform webhook did not contain a submission ID'
      );

      return res
        .status(400)
        .json({
          error:
            'Missing submission ID',
        });
    }


    /*
     * Do not trust identity information
     * directly from the webhook body.
     *
     * Retrieve the official submission
     * from Jotform using our read-only
     * API key.
     */
    const submission =
      await getJotformSubmission(
        submissionId
      );


    const submissionFormId =
      String(
        submission.form_id ||
        ''
      );


    if (
      submissionFormId &&
      submissionFormId !==
        JOTFORM_FORM_ID
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          ignored:
            'wrong_form',
        });
    }


    const waiver =
      getWaiverData(
        submission
      );


    /*
     * Ignore tryout, rental, party,
     * outside-team-practice and other
     * non-membership submissions.
     */
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


    /*
     * A 13U athlete is a minor.
     * No membership activation without
     * the required parent/legal guardian
     * signature.
     */
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


    if (
      !waiver.athleteName
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


    const stripe =
      getStripe();


    /*
     * Find exactly one already-paid
     * 13U enrollment.
     */
    const match =
      await findPaid13UCustomer(
        stripe,
        waiver
      );


    if (!match.customer) {

      console.log(
        '13U Jotform waiver did not match one unique paid enrollment',
        {
          submissionId,

          matchCount:
            match.matchCount,
        }
      );


      /*
       * This is not treated as a webhook
       * failure.
       *
       * It may simply mean the family
       * completed the waiver BEFORE
       * paying. In that case, the Stripe
       * payment webhook will check
       * Jotform later when payment occurs.
       */
      return res
        .status(200)
        .json({
          received:
            true,

          matched:
            false,
        });
    }


    const result =
      await recordVerifiedWaiver({
        stripe,

        customer:
          match.customer,

        submissionId,
      });


    /*
     * Duplicate webhook delivery:
     * metadata is already correct and
     * the activation email has already
     * been handled.
     */
    if (
      result.alreadyRecorded
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
        });
    }


    /*
     * If a later Academy installment is
     * currently delinquent, record the
     * waiver but DO NOT restore active
     * membership access.
     */
    if (
      !result.membershipActivated
    ) {
      return res
        .status(200)
        .json({
          received:
            true,

          matched:
            true,

          waiver_verified:
            true,

          membership_active:
            false,

          reason:
            'payment_attention_required',
        });
    }


    await sendActivationEmails({
      customer:
        match.customer,

      waiver,

      submissionId,

      sessionId:
        result.sessionId,
    });


    return res
      .status(200)
      .json({
        received:
          true,

        matched:
          true,

        waiver_verified:
          true,

        membership_active:
          true,
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
          'Waiver webhook processing failed',
      });
  }
}
