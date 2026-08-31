const Stripe = require('stripe');
const QRCode = require('qrcode');
const crypto = require('crypto');

const STRIPE_API_VERSION = '2026-07-29.dahlia';

const TEAM_NAME = '13U Baseball Academy';
const TEAM_CODE = '13U_BASEBALL_ACADEMY';
const PROGRAM = 'CYOJ Hit Lab 2027 Baseball Academy';
const SEASON = '2027';

const DEFAULT_SITE_URL =
  'https://cyoj-hit-lab-13u-baseball-academy.vercel.app';

function getId(value) {
  if (!value) return null;

  return typeof value === 'string'
    ? value
    : value.id;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getCustomFieldValue(session, key) {
  const field =
    (session.custom_fields || []).find(
      (item) => item.key === key
    );

  if (!field) return '';

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
    metadata.team === TEAM_NAME &&
    (
      metadata.team_code === TEAM_CODE ||
      metadata.program === PROGRAM
    )
  );
}

function createMemberId(sessionId) {
  const hash =
    crypto
      .createHash('sha256')
      .update(
        `CYOJ-13U-MEMBER-${sessionId}`
      )
      .digest('hex')
      .slice(0, 10)
      .toUpperCase();

  return `13U-${hash}`;
}

function getMembershipStatus({
  session,
  customer,
}) {
  if (
    session.payment_status !== 'paid'
  ) {
    return {
      key: 'inactive',
      label: 'NOT ACTIVE',
      message:
        'A confirmed Academy payment was not found.',
    };
  }

  const metadata =
    customer?.metadata || {};

  const enrollmentStatus =
    metadata.enrollment_status || '';

  if (
    enrollmentStatus ===
    'payment_attention_required'
  ) {
    return {
      key: 'attention',
      label:
        'PAYMENT ATTENTION REQUIRED',
      message:
        'A scheduled Academy payment requires attention.',
    };
  }

  if (
    enrollmentStatus ===
    'paid_in_full'
  ) {
    return {
      key: 'paid',
      label:
        'ACTIVE · PAID IN FULL',
      message:
        '2027 13U Baseball Academy membership is active.',
    };
  }

  return {
    key: 'active',
    label: 'ACTIVE',
    message:
      '2027 13U Baseball Academy membership is active.',
  };
}

function getSiteUrl(req) {
  const configured =
    String(
      process.env.SITE_URL || ''
    ).trim();

  if (configured) {
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

  if (host) {
    const protocol =
      req.headers[
        'x-forwarded-proto'
      ] || 'https';

    return `${protocol}://${host}`;
  }

  return DEFAULT_SITE_URL;
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
  <title>${escapeHtml(title)}</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100%;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      background: #09100c;
      color: #ffffff;
      font-family: Arial, sans-serif;
    }

    .panel {
      width: 100%;
      max-width: 620px;
      margin-top: 60px;
      padding: 34px;
      border: 1px solid #26342b;
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
    }
  </style>
</head>

<body>
  <main class="panel">
    <p class="kicker">
      CYOJ Hit Lab
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

function renderMemberCard({
  playerName,
  memberId,
  qrDataUrl,
  status,
  verificationUrl,
}) {
  const statusClass =
    status.key === 'attention'
      ? 'status-attention'
      : status.key === 'inactive'
        ? 'status-inactive'
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
    content="#08110c"
  >

  <title>
    ${escapeHtml(playerName)} · 13U Academy Member
  </title>

  <style>
    :root {
      --ink: #09100c;
      --green: #0d7a3b;
      --accent: #37cf73;
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
      background: #07100a;
      color: var(--white);
      font-family:
        Arial,
        Helvetica,
        sans-serif;
    }

    body {
      padding: 28px 18px 44px;
    }

    .shell {
      width: 100%;
      max-width: 620px;
      margin: 0 auto;
    }

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
      gap: 12px;
      min-width: 0;
    }

    .brand-mark {
      width: 52px;
      height: 52px;
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--accent);
      color: #041008;
      font-size: 18px;
      font-weight: 900;
      letter-spacing: -.03em;
    }

    .brand strong,
    .brand span {
      display: block;
    }

    .brand strong {
      font-size: 18px;
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

    .member-card {
      position: relative;
      overflow: hidden;
      border: 1px solid
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

    .member-card::after {
      content: "13U";
      position: absolute;
      right: -22px;
      bottom: -47px;
      color:
        rgba(255,255,255,.035);
      font-size: 210px;
      font-weight: 900;
      line-height: .8;
      pointer-events: none;
    }

    .card-body {
      position: relative;
      z-index: 1;
      padding: 34px;
    }

    .card-kicker {
      margin: 0;
      color: var(--accent);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .17em;
      text-transform: uppercase;
    }

    h1 {
      margin: 10px 0 0;
      font-size: clamp(
        38px,
        9vw,
        58px
      );
      line-height: .93;
      letter-spacing: -.035em;
      text-transform: uppercase;
    }

    .academy {
      margin: 8px 0 0;
      color: #d3ddd5;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 24px;
      padding: 9px 12px;
      border: 1px solid;
      font-size: 10px;
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
      color: #71e79c;
      border-color:
        rgba(113,231,156,.5);
      background:
        rgba(13,122,59,.15);
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
      margin: 12px 0 0;
      max-width: 420px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.55;
    }

    .card-lower {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns:
        minmax(0, 1fr)
        176px;
      gap: 28px;
      align-items: end;
      padding:
        0 34px 34px;
    }

    .member-data {
      min-width: 0;
    }

    .field {
      padding: 16px 0;
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
      font-size: 15px;
      line-height: 1.25;
      overflow-wrap: anywhere;
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

    .verification {
      margin-top: 16px;
      padding: 17px 18px;
      border: 1px solid var(--line);
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
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    .privacy {
      margin: 18px 0 0;
      color: #7f8c83;
      font-size: 9px;
      line-height: 1.5;
      text-align: center;
    }

    .help {
      margin: 24px 0 0;
      text-align: center;
      color: var(--muted);
      font-size: 10px;
    }

    .help a {
      color: #ffffff;
      font-weight: 800;
    }

    @media (max-width: 520px) {
      .topline {
        align-items: flex-start;
      }

      .season {
        margin-top: 5px;
      }

      .card-body {
        padding:
          28px 24px;
      }

      .card-lower {
        grid-template-columns:
          1fr;
        padding:
          0 24px 28px;
      }

      .qr-wrap {
        width: 176px;
      }
    }
  </style>
</head>

<body>

  <main class="shell">

    <div class="topline">

      <div class="brand">

        <!--
          Temporary 13U member mark.

          We will replace this with the
          approved separate 13U membership
          logo after the logo is finalized.
        -->
        <div
          class="brand-mark"
          aria-hidden="true"
        >
          13U
        </div>

        <div>
          <strong>
            CYOJ HIT LAB
          </strong>

          <span>
            Baseball Academy Member
          </span>
        </div>

      </div>

      <div class="season">
        2027
      </div>

    </div>


    <section class="member-card">

      <div class="card-body">

        <p class="card-kicker">
          Digital Membership Card
        </p>

        <h1>
          ${escapeHtml(playerName)}
        </h1>

        <p class="academy">
          13U Baseball Academy
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
              Program
            </span>

            <strong>
              CYOJ Hit Lab 2027
              13U Baseball Academy
            </strong>
          </div>

          <div class="field">
            <span>
              Verification
            </span>

            <strong>
              Scan QR for live status
            </strong>
          </div>

        </div>


        <div class="qr-wrap">

          <img
            src="${qrDataUrl}"
            alt="QR code for ${escapeHtml(playerName)} membership verification"
            width="156"
            height="156"
          >

        </div>

      </div>

    </section>


    <div class="verification">

      <strong>
        Live Membership Verification
      </strong>

      <span>
        This QR code opens the current
        CYOJ Hit Lab 13U Baseball Academy
        membership record. Status is
        generated from the athlete's
        confirmed Stripe Academy enrollment.
      </span>

    </div>


    <p class="privacy">
      This digital card does not display
      parent contact information or payment
      details.
    </p>


    <p class="help">
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

module.exports =
  async function handler(req, res) {
    if (
      req.method !== 'GET'
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

    /*
     * Do not allow membership-card
     * pages to be cached or indexed.
     */
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
      String(rawSessionId)
        .trim();

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
        await stripe.checkout.sessions.retrieve(
          sessionId,
          {
            expand: [
              'customer',
            ],
          }
        );

      if (
        !is13UCheckout(session)
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
        getSiteUrl(req);

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
            verificationUrl,
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
