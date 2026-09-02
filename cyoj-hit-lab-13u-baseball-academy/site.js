(() => {
  const choices = [
    ...document.querySelectorAll(".choice")
  ];

  const planDetails =
    document.getElementById("plan-details");

  const fullDetails =
    document.getElementById("full-details");

  const guardian =
    document.getElementById("guardian");

  const terms =
    document.getElementById("terms");

  const checkout =
    document.getElementById("checkout");

  const summaryTitle =
    document.getElementById("summary-title");

  const summaryPrice =
    document.getElementById("summary-price");


  /*
   * Current 13U Academy agreement version.
   *
   * Version 2 reflects the revised
   * $2,500 package and 2027 program terms.
   */
  const AGREEMENT_VERSION =
    "2026-09-01-13u-v2";


  /*
   * MASTER PAYMENT SAFETY LOCK
   *
   * DO NOT change this to true until:
   *
   * - 13U Stripe products/prices exist
   * - Vercel environment variables are added
   * - 13U webhook endpoint is created in Stripe
   * - webhook secret is added to Vercel
   * - Resend is configured
   * - membership QR card is tested
   * - installment cron is verified
   * - both checkout paths are tested
   */
  const CHECKOUT_ENABLED = false;


  let selected = "plan";
  let busy = false;


  function refresh() {
    const authorized =
      guardian.checked &&
      terms.checked &&
      !busy;

    checkout.classList.toggle(
      "disabled",
      !authorized
    );

    checkout.setAttribute(
      "aria-disabled",
      String(!authorized)
    );

    checkout.tabIndex =
      authorized ? 0 : -1;
  }


  function createAttemptId() {
    if (
      globalThis.crypto &&
      crypto.randomUUID
    ) {
      return crypto.randomUUID();
    }

    return (
      `${Date.now()}-` +
      `${Math.random()
        .toString(36)
        .slice(2)}`
    );
  }


  choices.forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        selected =
          button.dataset.plan;

        choices.forEach(
          (item) => {
            const active =
              item === button;

            item.classList.toggle(
              "selected",
              active
            );

            item.setAttribute(
              "aria-pressed",
              String(active)
            );
          }
        );


        const isPlan =
          selected === "plan";


        planDetails.classList.toggle(
          "hidden",
          !isPlan
        );

        fullDetails.classList.toggle(
          "hidden",
          isPlan
        );


        summaryTitle.textContent =
          isPlan
            ? "Installment plan"
            : "Pay in full";


        summaryPrice.textContent =
          isPlan
            ? "$1,000"
            : "$2,500";
      }
    );
  });


  [
    guardian,
    terms
  ].forEach(
    (element) => {
      element.addEventListener(
        "change",
        refresh
      );
    }
  );


  checkout.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();


      if (
        checkout.classList.contains(
          "disabled"
        ) ||
        busy
      ) {
        return;
      }


      /*
       * SAFETY LOCK
       *
       * Nothing can reach Stripe
       * while this remains false.
       */
      if (!CHECKOUT_ENABLED) {
        alert(
          "13U Baseball Academy secure checkout is still being configured. No payment has been started."
        );

        return;
      }


      busy = true;
      refresh();


      const originalText =
        checkout.textContent;


      checkout.textContent =
        "Opening secure Stripe checkout...";


      try {
        const attemptId =
          createAttemptId();


        /*
         * Use a different 13U backend
         * depending on the family's
         * selected payment option.
         */
        const endpoint =
          selected === "full"
            ? "/api/create-full-checkout"
            : "/api/create-installment-checkout";


        const response =
          await fetch(
            endpoint,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  team:
                    "13U Baseball Academy",

                  teamCode:
                    "13U_BASEBALL_ACADEMY",

                  season:
                    "2027",

                  paymentOption:
                    selected === "full"
                      ? "pay_in_full"
                      : "installment",

                  guardianAuthorized:
                    true,

                  installmentTermsAccepted:
                    true,

                  agreementVersion:
                    AGREEMENT_VERSION,

                  attemptId
                })
            }
          );


        const data =
          await response.json();


        if (
          !response.ok ||
          !data.url
        ) {
          throw new Error(
            data.error ||
            "Unable to create checkout"
          );
        }


        /*
         * Redirect only after our
         * 13U backend has successfully
         * created a Stripe Checkout
         * Session.
         */
        window.location.assign(
          data.url
        );

      } catch (error) {
        busy = false;

        checkout.textContent =
          originalText;

        refresh();


        alert(
          "We could not open the 13U Baseball Academy secure checkout. Please try again later or email academyteams@cyojhitlab.com."
        );


        console.error(
          "13U checkout failed",
          error
        );
      }
    }
  );


  refresh();
})();
