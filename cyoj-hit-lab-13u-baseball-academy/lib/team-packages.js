const PACKAGES = {
  unger_black: {
    key: 'unger_black',

    displayName:
      '13U Unger (Black)',

    teamVariant:
      'UNGER_BLACK',

    packageTotal:
      2500,

    packageTotalDisplay:
      '$2,500',

    initialAmount:
      1000,

    initialAmountDisplay:
      '$1,000',

    installment2Amount:
      750,

    installment2AmountDisplay:
      '$750',

    installment2Due:
      '2026-11-01',

    installment3Amount:
      750,

    installment3AmountDisplay:
      '$750',

    installment3Due:
      '2027-02-01',

    tournamentDisplay:
      '10–12 tournaments',

    tournamentShort:
      '10–12',

    fullPriceEnv:
      'STRIPE_13U_FULL_PRICE_ID',
  },


  green: {
    key:
      'green',

    displayName:
      '13U Green Team',

    teamVariant:
      'GREEN',

    packageTotal:
      1995,

    packageTotalDisplay:
      '$1,995',

    initialAmount:
      1000,

    initialAmountDisplay:
      '$1,000',

    installment2Amount:
      500,

    installment2AmountDisplay:
      '$500',

    installment2Due:
      '2026-11-01',

    installment3Amount:
      495,

    installment3AmountDisplay:
      '$495',

    installment3Due:
      '2027-02-01',

    tournamentDisplay:
      '8–10 tournaments guaranteed',

    tournamentShort:
      '8–10',

    fullPriceEnv:
      'STRIPE_13U_GREEN_FULL_PRICE_ID',
  },
};


function normalizeCode(value) {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase();
}


function getPackageFromAccessCode(
  code
) {
  const normalized =
    normalizeCode(code);

  if (!normalized) {
    return null;
  }


  const ungerCode =
    normalizeCode(
      process.env
        .TEAM_ACCESS_CODE_UNGER
    );

  const greenCode =
    normalizeCode(
      process.env
        .TEAM_ACCESS_CODE_GREEN
    );


  if (
    ungerCode &&
    normalized === ungerCode
  ) {
    return PACKAGES
      .unger_black;
  }


  if (
    greenCode &&
    normalized === greenCode
  ) {
    return PACKAGES
      .green;
  }


  return null;
}


function getPackageByKey(
  key
) {
  return (
    PACKAGES[
      String(
        key || ''
      ).trim()
    ] ||
    null
  );
}


module.exports = {
  PACKAGES,
  getPackageFromAccessCode,
  getPackageByKey,
};
