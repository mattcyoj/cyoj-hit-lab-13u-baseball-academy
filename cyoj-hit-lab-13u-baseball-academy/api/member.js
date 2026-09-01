const Stripe = require('stripe');
const QRCode = require('qrcode');
const crypto = require('crypto');

const STRIPE_API_VERSION = '2026-07-29.dahlia';

const TEAM_NAME = '13U Baseball Academy';
const TEAM_CODE = '13U_BASEBALL_ACADEMY';
const PROGRAM = 'CYOJ Hit Lab 2027 Baseball Academy';
const SEASON = '2027';

const JOTFORM_FORM_ID =
  '262305529358158';

const MEMBERSHIP_START_DISPLAY =
  'Aug. 1, 2026';

const MEMBERSHIP_END_DISPLAY =
  'Aug. 1, 2027';

const MEMBERSHIP_START =
  new Date(
    '2026-08-01T00:00:00-07:00'
  );

const MEMBERSHIP_END =
  new Date(
    '2027-08-02T00:00:00-07:00'
  );

const WAIVER_URL =
  'https://form.jotform.com/262305529358158';

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';


function getId(value) {
  if (!value) {
    return null;
  }

  return typeof value === 'string'
    ? value
    : value.id;
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


function normalizeMetadataValue(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase();
}


function normalizeIdentity(
  value
) {
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

  if (
    field.type === 'text'
  ) {
    return String(
      field.text?.value || ''
    ).trim();
  }

  if (
    field.type === 'dropdown'
  ) {
    return String(
      field.dropdown?.value || ''
    ).trim();
  }

  if (
    field.type === 'numeric'
  ) {
    return String(
      field.numeric?.value ?? ''
    ).trim();
  }

  return '';
}


function is13UCheckout(
  session
) {
  const metadata =
    session.metadata || {};

  return (
    metadata.team ===
      TEAM_NAME &&
    (
      metadata.team_code ===
        TEAM_CODE ||
      metadata.program ===
        PROGRAM
    )
  );
}


function createMemberId(
  sessionId
) {
  const hash =
    crypto
      .createHash(
        'sha256'
      )
      .update(
        `CYOJ-13U-MEMBER-${sessionId}`
      )
      .digest(
        'hex'
      )
      .slice(
        0,
        10
      )
      .toUpperCase();

  return `13U-${hash}`;
}


/*
 * A generic waiver_status=completed
 * value is NOT enough.
 *
 * A valid 13U membership waiver must:
 *
 * - be marked completed or verified
 * - belong to the current LIVE form
 * - contain a real Jotform submission ID
 * - belong to the same athlete
 */
function metadataHasCurrentWaiver({
  metadata,
  playerName,
}) {
  if (
    !metadata ||
    typeof metadata !==
      'object'
  ) {
    return false;
  }

  const waiverStatus =
    normalizeMetadataValue(
      metadata.waiver_status ||
      metadata.hit_lab_waiver_status
    );

  if (
    ![
      'completed',
      'verified',
    ].includes(
      waiverStatus
    )
  ) {
    return false;
  }

  const waiverFormId =
    String(
      metadata.waiver_form_id ||
      ''
    ).trim();

  if (
    waiverFormId !==
      JOTFORM_FORM_ID
  ) {
    return false;
  }

  const waiverSubmissionId =
    String(
      metadata.waiver_submission_id ||
      ''
    ).trim();

  if (
    !waiverSubmissionId
  ) {
    return false;
  }

  const expectedPlayer =
    normalizeIdentity(
      playerName
    );

  const storedPlayer =
    normalizeIdentity(
      metadata.player_name
    );

  if (
    !expectedPlayer ||
    !storedPlayer ||
    expectedPlayer !==
      storedPlayer
  ) {
    return false;
  }

  return true;
}


function hasCompletedWaiver({
  session,
  customer,
  playerName,
}) {
  const sessionMetadata =
    session?.metadata || {};

  const customerMetadata =
    customer?.metadata || {};

  return (
    metadataHasCurrentWaiver({
      metadata:
        sessionMetadata,

      playerName,
    }) ||
    metadataHasCurrentWaiver({
      metadata:
        customerMetadata,

      playerName,
    })
  );
}


function getMembershipStatus({
  session,
  customer,
}) {
  const now =
    new Date();

  if (
    session.payment_status !==
      'paid'
  ) {
    return {
      key:
        'inactive',

      label:
        'NOT ACTIVE',

      message:
        'A confirmed Academy payment was not found.',
    };
  }

  if (
    now >= MEMBERSHIP_END
  ) {
    return {
      key:
        'expired',

      label:
        'EXPIRED',

      message:
        'This 2027 13U Baseball Academy membership period has ended.',
    };
  }

  const metadata =
    customer?.metadata || {};

  const enrollmentStatus =
    normalizeMetadataValue(
      metadata.enrollment_status
    );

  const membershipStatus =
    normalizeMetadataValue(
      metadata.membership_status
    );

  /*
   * Either payment-standing field
   * can place the account into
   * payment-attention status.
   */
  if (
    enrollmentStatus ===
      'payment_attention_required' ||
    membershipStatus ===
      'payment_attention_required'
  ) {
    return {
      key:
        'attention',

      label:
        'PAYMENT ATTENTION REQUIRED',

      message:
        'A scheduled Academy payment requires attention before membership access can continue.',
    };
  }

  if (
    now < MEMBERSHIP_START
  ) {
    return {
      key:
        'scheduled',

      label:
        'ACTIVE · STARTS AUG. 1',

      message:
        'Payment and waiver requirements are complete. Membership access begins August 1, 2026.',
    };
  }

  if (
    enrollmentStatus ===
      'paid_in_full'
  ) {
    return {
      key:
        'paid',

      label:
        'ACTIVE · PAID IN FULL',

      message:
        'Payment confirmed and CYOJ Hit Lab Athlete Waiver verified.',
    };
  }

  return {
    key:
      'active',

    label:
      'ACTIVE · PAYMENT PLAN CURRENT',

    message:
      'Payment confirmed and CYOJ Hit Lab Athlete Waiver verified.',
  };
}


function getSiteUrl(
  req
) {
  const configured =
    String(
      process.env.SITE_URL ||
      ''
    ).trim();

  if (
    configured
  ) {
    return configured.replace(
      /\/+$/,
      ''
    );
  }

  const host =
    req.headers[
      'x-forwarded-host'
    ] ||
    req.headers.host;

  if (
    host
  ) {
    const protocol =
      req.headers[
        'x-forwarded-proto'
      ] ||
      'https';

    return `${protocol}://${host}`;
  }

  return DEFAULT_SITE_URL;
}


function setSecurityHeaders(
  res
) {
  res.setHeader(
    'Cache-Control',
    'private, no-store, max-age=0'
  );

  res.setHeader(
    'Pragma',
    'no-cache'
  );

  res.setHeader(
    'X-Robots-Tag',
    'noindex, nofollow'
  );

  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  res.setHeader(
    'Referrer-Policy',
    'no-referrer'
  );

  res.setHeader(
    'Content-Type',
    'text/html; charset=utf-8'
  );
}


function renderErrorPage({
  title,
  message,
}) {
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <meta
    name="robots"
    content="noindex,nofollow"
  >

  <meta
    name="theme-color"
    content="#07100a"
  >

  <title>
    ${escapeHtml(title)} | CYOJ Hit Lab
  </title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;

      min-height: 100vh;

      padding:
        40px
        20px;

      display: flex;

      justify-content: center;
      align-items: flex-start;

      background:
        radial-gradient(
          circle at 75% 10%,
          rgba(55,207,115,.12),
          transparent 30%
        ),
        #07100a;

      color: #ffffff;

      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    .panel {
      width: 100%;
      max-width: 620px;

      margin-top: 60px;

      padding: 34px;

      border:
        1px solid #26342b;

      background: #111b15;
    }

    .kicker {
      margin: 0 0 10px;

      color: #37cf73;

      font-size: 11px;
      font-weight: 800;

      letter-spacing: .14em;

      text-transform: uppercase;
    }

    h1 {
      margin: 0;

      font-size: 34px;

      line-height: 1;

      text-transform: uppercase;
    }

    p {
      margin: 18px 0 0;

      color: #c9d2cb;

      line-height: 1.6;
    }

    a {
      color: #71e79c;

      font-weight: 800;
    }
  </style>
</head>

<body>

  <main class="panel">

    <p class="kicker">
      CYOJ Hit Lab · 13U Baseball Academy
    </p>

    <h1>
      ${escapeHtml(title)}
    </h1>

    <p>
      ${escapeHtml(message)}
    </p>

    <p>
      Questions?
      <a
        href="mailto:support@cyojhitlab.com"
      >
        support@cyojhitlab.com
      </a>
    </p>

  </main>

</body>
</html>
`;
}


function renderWaiverPendingPage({
  playerName,
}) {
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <meta
    name="robots"
    content="noindex,nofollow"
  >

  <meta
    name="theme-color"
    content="#07100a"
  >

  <title>
    Membership Pending | CYOJ Hit Lab
  </title>

  <style>
    :root {
      --ink: #07100a;
      --panel: #101b14;
      --accent: #37cf73;
      --accent-soft: #71e79c;
      --muted: #b2bdb5;
      --line: #26342b;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;

      min-height: 100vh;

      padding:
        30px
        18px
        50px;

      background:
        radial-gradient(
          circle at 82% 8%,
          rgba(55,207,115,.14),
          transparent 30%
        ),
        var(--ink);

      color: #fff;

      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    .shell {
      width: 100%;
      max-width: 620px;

      margin: 0 auto;
    }

    .brand {
      display: flex;
      align-items: center;

      gap: 13px;

      margin-bottom: 22px;
    }

    .brand img {
      width: 56px;
      height: 56px;

      object-fit: contain;
    }

    .brand strong,
    .brand span {
      display: block;
    }

    .brand strong {
      font-size: 19px;

      letter-spacing: .06em;
    }

    .brand span {
      margin-top: 4px;

      color: #99a69d;

      font-size: 9px;
      font-weight: 700;

      letter-spacing: .12em;

      text-transform: uppercase;
    }

    .panel {
      position: relative;

      overflow: hidden;

      padding:
        clamp(30px,6vw,44px);

      border:
        1px solid rgba(55,207,115,.36);

      background:
        linear-gradient(
          145deg,
          #111d16,
          #09110c
        );
    }

    .panel::after {
      content: "13U";

      position: absolute;

      right: -18px;
      bottom: -40px;

      color:
        rgba(255,255,255,.035);

      font-size: 190px;
      font-weight: 900;

      line-height: .8;

      pointer-events: none;
    }

    .content {
      position: relative;

      z-index: 1;
    }

    .kicker {
      margin: 0;

      color: var(--accent-soft);

      font-size: 9px;
      font-weight: 900;

      letter-spacing: .17em;

      text-transform: uppercase;
    }

    h1 {
      margin: 12px 0 0;

      font-size:
        clamp(
          40px,
          11vw,
          58px
        );

      line-height: .9;

      letter-spacing: -.03em;

      text-transform: uppercase;
    }

    .player {
      margin: 16px 0 0;

      color: #ffffff;

      font-size: 18px;
      font-weight: 800;
    }

    .confirmed {
      margin-top: 28px;

      padding:
        16px
        18px;

      border-left:
        3px solid var(--accent);

      background:
        rgba(55,207,115,.08);
    }

    .confirmed strong {
      display: block;

      color: var(--accent-soft);

      font-size: 11px;

      letter-spacing: .08em;

      text-transform: uppercase;
    }

    .confirmed p {
      margin: 7px 0 0;

      color: var(--muted);

      font-size: 12px;

      line-height: 1.6;
    }

    .requirement {
      margin-top: 26px;

      color: var(--muted);

      font-size: 13px;

      line-height: 1.7;
    }

    .button {
      display: block;

      width: 100%;

      margin-top: 26px;

      padding:
        16px
        18px;

      background: var(--accent);

      color: #041008;

      font-size: 12px;
      font-weight: 900;

      letter-spacing: .06em;

      text-align: center;
      text-transform: uppercase;
      text-decoration: none;
    }

    .help {
      margin: 20px 0 0;

      color: #8e9a91;

      font-size: 10px;

      line-height: 1.6;

      text-align: center;
    }

    .help a {
      color: #fff;

      font-weight: 800;
    }
  </style>
</head>

<body>

  <main class="shell">

    <div class="brand">

      <img
        src="/team-logo.webp"
        alt=""
        width="56"
        height="56"
      >

      <div>

        <strong>
          CYOJ HIT LAB
        </strong>

        <span>
          2027 · 13U Baseball Academy
        </span>

      </div>

    </div>


    <section class="panel">

      <div class="content">

        <p class="kicker">
          Membership Activation
        </p>

        <h1>
          Athlete Waiver<br>
          Required
        </h1>

        <p class="player">
          ${escapeHtml(playerName)}
        </p>


        <div class="confirmed">

          <strong>
            Academy payment confirmed
          </strong>

          <p>
            We found the athlete's successful
            13U Baseball Academy payment.
          </p>

        </div>


        <p class="requirement">
          A current CYOJ Hit Lab Athlete Waiver
          must also be completed and verified before
          this digital membership card becomes active.
        </p>


        <a
          class="button"
          href="${WAIVER_URL}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Complete Athlete Waiver →
        </a>

      </div>

    </section>


    <p class="help">
      Already completed the waiver?
      Verification may still be processing.
      Questions?
      <a
        href="mailto:support@cyojhitlab.com"
      >
        support@cyojhitlab.com
      </a>
    </p>

  </main>

</body>
</html>
`;
}


function renderMemberCard({
  playerName,
  memberId,
  qrDataUrl,
  status,
}) {
  const statusClass =
    status.key === 'attention'
      ? 'status-attention'
      : status.key === 'inactive'
        ? 'status-inactive'
        : status.key === 'expired'
          ? 'status-inactive'
          : status.key === 'scheduled'
            ? 'status-scheduled'
            : 'status-active';

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <meta
    name="robots"
    content="noindex,nofollow"
  >

  <meta
    name="theme-color"
    content="#07100a"
  >

  <title>
    ${escapeHtml(playerName)} · 13U Academy Member
  </title>

  <style>
    :root {
      --ink: #07100a;
      --green: #0d7a3b;
      --accent: #37cf73;
      --accent-soft: #71e79c;
      --white: #ffffff;
      --muted: #aab5ad;
      --line: #26342b;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;

      min-height: 100%;

      background: var(--ink);

      color: var(--white);

      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    body {
      padding:
        28px
        18px
        44px;
    }

    .shell {
      width: 100%;

      max-width: 650px;

      margin: 0 auto;
    }


    /* HEADER */

    .topline {
      display: flex;

      align-items: center;
      justify-content: space-between;

      gap: 18px;

      margin-bottom: 18px;
    }

    .brand {
      display: flex;

      align-items: center;

      gap: 13px;

      min-width: 0;
    }

    .brand-logo {
      width: 58px;
      height: 58px;

      flex: 0 0 auto;

      object-fit: contain;
    }

    .brand strong,
    .brand span {
      display: block;
    }

    .brand strong {
      font-size: 19px;

      line-height: 1;

      letter-spacing: .06em;
    }

    .brand span {
      margin-top: 4px;

      color: var(--muted);

      font-size: 9px;

      letter-spacing: .12em;

      text-transform: uppercase;
    }

    .season {
      color: var(--accent);

      font-size: 10px;
      font-weight: 900;

      letter-spacing: .14em;

      text-transform: uppercase;

      white-space: nowrap;
    }


    /* CARD */

    .member-card {
      position: relative;

      overflow: hidden;

      border:
        1px solid
        rgba(55,207,115,.42);

      background:
        radial-gradient(
          circle at 88% 12%,
          rgba(55,207,115,.18),
          transparent 30%
        ),
        linear-gradient(
          145deg,
          #111d16 0%,
          #09100c 65%,
          #07100a 100%
        );
    }

    .card-watermark {
      position: absolute;

      right: -60px;
      top: 50%;

      width: 390px;

      transform:
        translateY(-50%);

      opacity: .055;

      pointer-events: none;
    }

    .card-watermark img {
      display: block;

      width: 100%;
      height: auto;
    }

    .card-body {
      position: relative;

      z-index: 1;

      padding:
        34px
        34px
        28px;
    }

    .card-kicker {
      margin: 0;

      color: var(--accent);

      font-size: 9px;
      font-weight: 900;

      letter-spacing: .17em;

      text-transform: uppercase;
    }

    h1 {
      max-width: 500px;

      margin: 11px 0 0;

      font-size:
        clamp(
          38px,
          9vw,
          60px
        );

      line-height: .91;

      letter-spacing: -.035em;

      text-transform: uppercase;
    }

    .academy {
      margin: 10px 0 0;

      color: #d3ddd5;

      font-size: 13px;
      font-weight: 800;

      text-transform: uppercase;

      letter-spacing: .05em;
    }


    /* STATUS */

    .status {
      display: inline-flex;

      align-items: center;

      gap: 8px;

      margin-top: 24px;

      padding:
        9px
        12px;

      border: 1px solid;

      font-size: 9px;
      font-weight: 900;

      letter-spacing: .10em;

      text-transform: uppercase;
    }

    .status::before {
      content: "";

      width: 8px;
      height: 8px;

      border-radius: 50%;

      background: currentColor;
    }

    .status-active {
      color: var(--accent-soft);

      border-color:
        rgba(113,231,156,.5);

      background:
        rgba(13,122,59,.15);
    }

    .status-scheduled {
      color: #9ed7ff;

      border-color:
        rgba(158,215,255,.45);

      background:
        rgba(158,215,255,.08);
    }

    .status-attention {
      color: #ffd166;

      border-color:
        rgba(255,209,102,.5);

      background:
        rgba(255,209,102,.08);
    }

    .status-inactive {
      color: #ff8f8f;

      border-color:
        rgba(255,143,143,.5);

      background:
        rgba(255,143,143,.08);
    }

    .status-message {
      max-width: 450px;

      margin: 12px 0 0;

      color: var(--muted);

      font-size: 11px;

      line-height: 1.55;
    }


    /* MEMBER DETAILS */

    .card-lower {
      position: relative;

      z-index: 1;

      display: grid;

      grid-template-columns:
        minmax(0,1fr)
        176px;

      gap: 30px;

      align-items: end;

      padding:
        0
        34px
        34px;
    }

    .member-data {
      min-width: 0;
    }

    .field {
      padding:
        15px
        0;

      border-top:
        1px solid
        rgba(255,255,255,.12);
    }

    .field span,
    .field strong {
      display: block;
    }

    .field span {
      color: var(--muted);

      font-size: 8px;
      font-weight: 800;

      letter-spacing: .13em;

      text-transform: uppercase;
    }

    .field strong {
      margin-top: 5px;

      font-size: 14px;

      line-height: 1.3;

      overflow-wrap: anywhere;
    }


    /* QR */

    .qr-column {
      text-align: center;
    }

    .qr-wrap {
      padding: 10px;

      background: #ffffff;
    }

    .qr-wrap img {
      display: block;

      width: 100%;
      height: auto;
    }

    .qr-column span {
      display: block;

      margin-top: 8px;

      color: #8f9b92;

      font-size: 8px;

      line-height: 1.4;

      text-transform: uppercase;

      letter-spacing: .08em;
    }


    /* MEMBER BENEFITS */

    .member-benefits {
      display: grid;

      grid-template-columns:
        1fr
        1fr
        1fr;

      gap: 1px;

      margin-top: 16px;

      border:
        1px solid var(--line);

      background: var(--line);
    }

    .member-benefits div {
      padding:
        16px
        14px;

      background: #0c1610;
    }

    .member-benefits strong,
    .member-benefits span {
      display: block;
    }

    .member-benefits strong {
      color: var(--accent);

      font-size: 9px;

      letter-spacing: .08em;

      text-transform: uppercase;
    }

    .member-benefits span {
      margin-top: 6px;

      color: var(--muted);

      font-size: 9px;

      line-height: 1.45;
    }


    /* VERIFICATION */

    .verification {
      margin-top: 16px;

      padding:
        17px
        18px;

      border:
        1px solid var(--line);

      background: #0c1610;
    }

    .verification strong,
    .verification span {
      display: block;
    }

    .verification strong {
      color: var(--accent);

      font-size: 10px;

      letter-spacing: .12em;

      text-transform: uppercase;
    }

    .verification span {
      margin-top: 7px;

      color: var(--muted);

      font-size: 9px;

      line-height: 1.55;
    }

    .privacy {
      margin:
        18px
        0
        0;

      color: #7f8c83;

      font-size: 9px;

      line-height: 1.5;

      text-align: center;
    }

    .help {
      margin:
        24px
        0
        0;

      text-align: center;

      color: var(--muted);

      font-size: 10px;
    }

    .help a {
      color: #ffffff;

      font-weight: 800;
    }


    /* MOBILE */

    @media (max-width: 560px) {

      .topline {
        align-items: flex-start;
      }

      .brand-logo {
        width: 50px;
        height: 50px;
      }

      .season {
        margin-top: 5px;
      }

      .card-body {
        padding:
          28px
          24px
          24px;
      }

      .card-lower {
        grid-template-columns:
          1fr;

        padding:
          0
          24px
          28px;
      }

      .qr-column {
        text-align: left;
      }

      .qr-wrap {
        width: 176px;
      }

      .qr-column span {
        max-width: 176px;

        text-align: center;
      }

      .member-benefits {
        grid-template-columns:
          1fr;
      }

      .card-watermark {
        right: -105px;

        width: 330px;
      }
    }
  </style>
</head>


<body>

  <main class="shell">


    <!-- TOP BRAND -->
    <div class="topline">

      <div class="brand">

        <img
          class="brand-logo"
          src="/team-logo.webp"
          alt=""
          width="58"
          height="58"
        >

        <div>

          <strong>
            CYOJ HIT LAB
          </strong>

          <span>
            13U Baseball Academy Member
          </span>

        </div>

      </div>


      <div class="season">
        ${SEASON}
      </div>

    </div>



    <!-- DIGITAL CARD -->
    <section class="member-card">


      <div
        class="card-watermark"
        aria-hidden="true"
      >

        <img
          src="/team-logo.webp"
          alt=""
        >

      </div>


      <div class="card-body">

        <p class="card-kicker">
          Official Digital Membership Card
        </p>

        <h1>
          ${escapeHtml(playerName)}
        </h1>

        <p class="academy">
          2027 13U Baseball Academy
        </p>


        <div
          class="status ${statusClass}"
        >
          ${escapeHtml(status.label)}
        </div>


        <p class="status-message">
          ${escapeHtml(status.message)}
        </p>

      </div>



      <div class="card-lower">


        <div class="member-data">


          <div class="field">

            <span>
              Member ID
            </span>

            <strong>
              ${escapeHtml(memberId)}
            </strong>

          </div>


          <div class="field">

            <span>
              Membership Period
            </span>

            <strong>
              ${MEMBERSHIP_START_DISPLAY}
              –
              ${MEMBERSHIP_END_DISPLAY}
            </strong>

          </div>


          <div class="field">

            <span>
              Program
            </span>

            <strong>
              CYOJ Hit Lab
              2027 13U Baseball Academy
            </strong>

          </div>


          <div class="field">

            <span>
              Verification
            </span>

            <strong>
              Live QR membership status
            </strong>

          </div>

        </div>



        <div class="qr-column">

          <div class="qr-wrap">

            <img
              src="${qrDataUrl}"
              alt="QR code for ${escapeHtml(playerName)} membership verification"
              width="156"
              height="156"
            >

          </div>

          <span>
            Scan to verify
          </span>

        </div>

      </div>

    </section>



    <!-- BENEFITS -->
    <section
      class="member-benefits"
      aria-label="Membership benefits"
    >

      <div>

        <strong>
          Hit Lab Access
        </strong>

        <span>
          Unlimited use during regular business hours.
        </span>

      </div>


      <div>

        <strong>
          Camps & Clinics
        </strong>

        <span>
          10% member discount.
        </span>

      </div>


      <div>

        <strong>
          Merchandise
        </strong>

        <span>
          10% member discount.
        </span>

      </div>

    </section>



    <!-- LIVE STATUS -->
    <div class="verification">

      <strong>
        Live Membership Verification
      </strong>

      <span>
        This QR code opens the athlete's current
        CYOJ Hit Lab 13U Baseball Academy membership
        record. Active status requires a confirmed
        Academy payment, a verified CYOJ Hit Lab
        Athlete Waiver, and a membership account
        in good standing.
      </span>

    </div>


    <p class="privacy">
      This digital card does not display
      parent contact information, waiver details
      or payment credentials.
    </p>


    <p class="help">
      Membership questions?
      <a
        href="mailto:support@cyojhitlab.com"
      >
        support@cyojhitlab.com
      </a>
    </p>

  </main>

</body>
</html>
`;
}


module.exports =
  async function handler(
    req,
    res
  ) {

    setSecurityHeaders(
      res
    );

    if (
      req.method !==
        'GET'
    ) {
      res.setHeader(
        'Allow',
        'GET'
      );

      return res
        .status(405)
        .send(
          renderErrorPage({
            title:
              'Method Not Allowed',

            message:
              'This membership page can only be viewed in a browser.',
          })
        );
    }


    if (
      !process.env
        .STRIPE_SECRET_KEY
    ) {
      return res
        .status(500)
        .send(
          renderErrorPage({
            title:
              'Membership Unavailable',

            message:
              'Membership verification is temporarily unavailable.',
          })
        );
    }


    const rawSessionId =
      req.query?.session_id ||
      req.query?.sessionId ||
      '';

    const sessionId =
      String(
        rawSessionId
      ).trim();


    if (
      !sessionId ||
      !sessionId.startsWith(
        'cs_'
      )
    ) {
      return res
        .status(400)
        .send(
          renderErrorPage({
            title:
              'Invalid Membership Link',

            message:
              'A valid 13U Baseball Academy membership record was not provided.',
          })
        );
    }


    const stripe =
      new Stripe(
        process.env
          .STRIPE_SECRET_KEY,
        {
          apiVersion:
            STRIPE_API_VERSION,
        }
      );


    try {

      const session =
        await stripe.checkout
          .sessions.retrieve(
            sessionId,
            {
              expand: [
                'customer',
              ],
            }
          );


      if (
        !is13UCheckout(
          session
        )
      ) {
        return res
          .status(404)
          .send(
            renderErrorPage({
              title:
                'Membership Not Found',

              message:
                'This record is not a CYOJ Hit Lab 13U Baseball Academy membership.',
            })
          );
      }


      if (
        session.payment_status !==
          'paid'
      ) {
        return res
          .status(403)
          .send(
            renderErrorPage({
              title:
                'Membership Not Active',

              message:
                'A confirmed 13U Baseball Academy payment is required before a digital membership card can be issued.',
            })
          );
      }


      const customer =
        typeof session.customer ===
          'object'
          ? session.customer
          : null;


      const playerName =
        getCustomFieldValue(
          session,
          'player_name'
        ) ||
        session.metadata
          ?.player_name ||
        customer
          ?.metadata
          ?.player_name ||
        '13U Academy Athlete';


      /*
       * Payment alone is never enough.
       *
       * The membership card requires
       * a current LIVE Jotform waiver,
       * a real waiver submission ID,
       * and a same-athlete match.
       */
      const waiverCompleted =
        hasCompletedWaiver({
          session,
          customer,
          playerName,
        });


      if (
        !waiverCompleted
      ) {
        return res
          .status(200)
          .send(
            renderWaiverPendingPage({
              playerName,
            })
          );
      }


      const memberId =
        createMemberId(
          session.id
        );


      const status =
        getMembershipStatus({
          session,
          customer,
        });


      const siteUrl =
        getSiteUrl(
          req
        );


      const verificationUrl =
        `${siteUrl}/member/` +
        `${encodeURIComponent(
          session.id
        )}`;


      const qrDataUrl =
        await QRCode.toDataURL(
          verificationUrl,
          {
            errorCorrectionLevel:
              'M',

            margin:
              1,

            width:
              360,
          }
        );


      return res
        .status(200)
        .send(
          renderMemberCard({
            playerName,
            memberId,
            qrDataUrl,
            status,
          })
        );

    } catch (error) {

      console.error(
        '13U membership card lookup failed',
        {
          sessionId,

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


      if (
        error.code ===
          'resource_missing'
      ) {
        return res
          .status(404)
          .send(
            renderErrorPage({
              title:
                'Membership Not Found',

              message:
                'The requested 13U Baseball Academy membership record could not be found.',
            })
          );
      }


      return res
        .status(500)
        .send(
          renderErrorPage({
            title:
              'Membership Unavailable',

            message:
              'We could not verify this membership right now. Please try again later.',
          })
        );
    }
  };
