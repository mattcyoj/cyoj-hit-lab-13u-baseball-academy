# CYOJ Hit Lab 13U Baseball Academy — Hit Lab Global Governance Inheritance

**HITLAB-GOVERNANCE-CONTRACT: 2026-10-29-v1**  
**Status:** REQUIRED REPOSITORY CONTROL  
**Canonical governance repository:** `mattcyoj/cyoj-hit-lab-platform`  
**Canonical umbrella:** `CYOJ_HIT_LAB_GLOBAL_GOVERNANCE.md`  
**Canonical Production certification:** `docs/governance/HIT_LAB_360_PRODUCTION_RELEASE_CERTIFICATION.md`

## Repository role

Academy/team web repository. It is a presentation/transaction surface, not the authority for roster, family-contact, payment-exception, waiver, or team-assignment facts.

This repository is part of the CYOJ Hit Lab ecosystem and inherits the global Hit Lab governance minimum.

Local rules may be stricter. They may not weaken the global minimum.

## Mandatory inherited rules

1. **GitHub is durable governance authority.** Chat memory is supporting context only.
2. **Domain authority is preserved.** Code/content in this repo does not silently become the source of truth for Academy rosters, family contacts, payment exceptions, waivers, team assignments, memberships, canonical people, access, or other business facts owned elsewhere.
3. **Production readiness is coverage-based, not audit-count-based.** Repeating the same audit 3, 10, 15, 90 or 100 times is not an additional safety control.
4. **Ordinary language triggers certification.** Requests such as “audit this,” “audit again,” “check this before deploy,” “are we safe,” “are we good,” “final check,” or equivalent trigger the applicable Production-readiness certification automatically.
5. **UNKNOWN is not PASS.** FAIL is not PASS. NOT_APPLICABLE requires a reason.
6. **Exact candidate only.** Release evidence applies to one exact candidate/commit and must be refreshed when materially relevant state changes.
7. **Parents/customers are not first QA.** Use Preview/test/contained verification before public/customer release.
8. **Cross-repository effects must be reconciled.** If this repo changes a shared Hit Lab/Academy membership, payment, waiver, access, enrollment, person, URL or customer/staff workflow, reconcile with Hit Lab 360 and the owning operational authority.
9. **No silent Production mutation.** A green Preview or prior conversational approval is not enough.
10. **Explicit scoped Production approval is required** for the tested change before Production/public mutation when the workstream is under Production Lock.
11. **Rollback/recovery must be known** before risky release.
12. **Post-deploy verification is part of release.**
13. **If a later miss reveals an uncovered risk class, improve the durable checklist/test/control.** Do not increase a magic audit count.

## Academy-specific source-of-truth rule

For Academy/team work:
- Academy Operations owns the current real roster, coach/team assignment, family contact information, actual payment/outside-payment facts, discounts/sponsorships/exceptions and team administration.
- This repo must not resurrect stale player/team/payment/contact facts merely because old code or page content still contains them.
- Shared Academy enrollment/payment/waiver behavior belongs to the 360 system contract and must be evaluated as shared behavior, not only as a team-page concern.

## When canonical governance is unavailable

This local file remains the minimum safety contract.

For LOW isolated presentation work, continue only within this local contract if repository state is clear.

For shared, payment, data, waiver, access, auth, webhook, cron, Production-environment, or other HIGH/CRITICAL work, remain READ ONLY until the canonical Hit Lab governance can be reconciled.

## Version synchronization

Current inherited contract marker:

`HITLAB-GOVERNANCE-CONTRACT: 2026-10-29-v1`

If the canonical global contract materially changes, this repository must be reviewed for synchronization before the newer contract is treated as fully inherited here.
