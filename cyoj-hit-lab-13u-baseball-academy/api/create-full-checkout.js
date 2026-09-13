module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  /*
   * RETIRED LEGACY 13U PAY-IN-FULL CHECKOUT
   *
   * The standalone 13U Academy billing system has been
   * superseded by Hit Lab 360. This endpoint must never
   * create a Stripe Checkout Session or collect payment.
   *
   * Current Academy enrollment and billing are handled at:
   * https://mycyojhitlab.com/academy/13u-baseball
   */
  return res.status(410).json({
    error:
      'This legacy 13U pay-in-full payment endpoint has been retired. Please use Hit Lab 360 for Academy enrollment and billing.',
  });
};
