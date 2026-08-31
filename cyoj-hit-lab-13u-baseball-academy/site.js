(() => {
  const choices = [...document.querySelectorAll(".choice")];
  const planDetails = document.getElementById("plan-details");
  const fullDetails = document.getElementById("full-details");
  const guardian = document.getElementById("guardian");
  const terms = document.getElementById("terms");
  const checkout = document.getElementById("checkout");
  const summaryTitle = document.getElementById("summary-title");
  const summaryPrice = document.getElementById("summary-price");

  /*
   * SAFETY LOCK
   *
   * Leave this false until the 13U Stripe checkout,
   * installment backend, webhook and environment variables
   * have all been configured and tested.
   */
  const CHECKOUT_ENABLED = false;

  /*
   * The 13U pay-in-full Stripe URL will be added here
   * after the new 13U Stripe payment link is created.
   *
   * Do not reuse the 14U Yeaney Stripe link.
   */
  const fullLink = "";

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

    checkout.tabIndex = authorized ? 0 : -1;
  }

  choices.forEach((button) => {
    button.addEventListener("click", () => {
      selected = button.dataset.plan;

      choices.forEach((item) => {
        const active = item === button;

        item.classList.toggle(
          "selected",
          active
        );

        item.setAttribute(
          "aria-pressed",
          String(active)
        );
      });

      const isPlan = selected === "plan";

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
          : "$1,995";
    });
  });

  [guardian, terms].forEach((element) => {
    element.addEventListener(
      "change",
      refresh
    );
  });

  checkout.addEventListener(
    "click",
    async (event) => {
      event.preventDefault();

      if (
        checkout.classList.contains("disabled") ||
        busy
      ) {
        return;
      }

      /*
       * Prevent any payment from being started
       * until the 13U Stripe system is finished.
       */
      if (!CHECKOUT_ENABLED) {
        alert(
          "13U Baseball Academy secure checkout is still being configured. No payment has been started."
        );

        return;
      }

      /*
       * PAY IN FULL
       */
      if (selected === "full") {
        if (
          !fullLink ||
          !fullLink.startsWith("https://")
        ) {
          alert(
            "13U pay-in-full checkout is not configured yet. Please email academyteams@cyojhitlab.com."
          );

          return;
        }

        window.location.assign(fullLink);

        return;
      }

      /*
       * INSTALLMENT PLAN
       */
      busy = true;
      refresh();

      const originalText =
        checkout.textContent;

      checkout.textContent =
        "Opening secure Stripe checkout...";

      try {
        const attemptId =
          globalThis.crypto &&
          crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}`;

        const response = await fetch(
          "/api/create-installment-checkout",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              team:
                "13U Baseball Academy",

              season:
                "2027",

              guardianAuthorized:
                true,

              installmentTermsAccepted:
                true,

              agreementVersion:
                "2026-08-31-13u-v1",

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

        window.location.assign(
          data.url
        );
      } catch (error) {
        busy = false;

        checkout.textContent =
          originalText;

        refresh();

        alert(
          "We could not open the 13U Baseball Academy Stripe checkout. Please try again later or email academyteams@cyojhitlab.com."
        );

        console.error(error);
      }
    }
  );

  refresh();
})();
