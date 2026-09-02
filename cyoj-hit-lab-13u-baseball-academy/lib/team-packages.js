const PACKAGES = {
  unger_black: {
    key: 'unger_black',

    displayName:
      '13U Black Unger',

    coachName:
      'Unger',

    teamVariant:
      'UNGER_BLACK',

    packageTotal:
      2700,

    packageTotalDisplay:
      '$2,700',

    initialAmount:
      1000,

    initialAmountDisplay:
      '$1,000',

    installment2Amount:
      950,

    installment2AmountDisplay:
      '$950',

    installment2Due:
      '2026-11-01',

    installment3Amount:
      750,

    installment3AmountDisplay:
      '$750',

    installment3Due:
      '2027-02-01',

    tournamentCount:
      12,

    tournamentDisplay:
      '12 tournaments',

    tournamentShort:
      '12',

    tournamentType:
      'season schedule',

    indoorTrainingDisplay:
      '2 team training days each week inside CYOJ Hit Lab',

    outdoorTrainingDisplay:
      '1 guaranteed outdoor practice day each week at Geer Park',

    outdoorTrainingStart:
      null,

    membershipDisplay:
      'Normal CYOJ Hit Lab Academy membership',

    afterHoursDisplay:
      'After-hours access available first come, first served',

    brettMonthlyIncluded:
      true,

    brettMonthlyDisplay:
      '1 hosted Brett Evert training class per month included',

    brettGroupPrice:
      20,

    brettGroupDisplay:
      '$20 additional group sessions',

    brettIndividualPrice:
      40,

    brettIndividualMinutes:
      30,

    brettIndividualDisplay:
      '$40 additional individual 30-minute sessions',

    uniformDisplay:
      '2 uniform sets',

    fallBallIncluded:
      true,

    fallBallHeadline:
      'FALL BALL INCLUDED',

    fallBallDisplay:
      'The $2,700 player fee includes fall ball fees and fall ball jerseys. These are included in the total package price and are not an additional charge.',

    refundPolicyDisplay:
      'Team fees are non-refundable.',

    fullPriceEnv:
      'STRIPE_13U_BLACK_FULL_PRICE_ID',
  },


  green: {
    key:
      'green',

    displayName:
      '13U Green Team',

    coachName:
      'TBD',

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

    tournamentCount:
      7,

    tournamentDisplay:
      '7 guaranteed local tournaments',

    tournamentShort:
      '7 guaranteed',

    tournamentType:
      'local tournaments',

    indoorTrainingDisplay:
      '2 team training days each week inside CYOJ Hit Lab',

    outdoorTrainingDisplay:
      '1 guaranteed outdoor practice day each week beginning in March',

    outdoorTrainingStart:
      '2027-03-01',

    membershipDisplay:
      'Normal CYOJ Hit Lab Academy membership',

    afterHoursDisplay:
      'After-hours access available first come, first served',

    brettMonthlyIncluded:
      true,

    brettMonthlyDisplay:
      '1 hosted Brett Evert training class per month included',

    brettGroupPrice:
      20,

    brettGroupDisplay:
      '$20 additional group sessions',

    brettIndividualPrice:
      40,

    brettIndividualMinutes:
      30,

    brettIndividualDisplay:
      '$40 additional individual 30-minute sessions',

    uniformDisplay:
      '2 uniform sets',

    fallBallIncluded:
      false,

    fallBallHeadline:
      null,

    fallBallDisplay:
      null,

    refundPolicyDisplay:
      'Team fees are non-refundable.',

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
