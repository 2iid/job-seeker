# Security policy

This product acts on people's behalf and stores some of the most sensitive data a person has: their
CV, their salary, and the fact that they are looking for work — sometimes while employed. We take
reports seriously and we would rather hear from you than not.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. If that is
unavailable to you, open a normal issue containing only the sentence "I have a security report" and
no details, and we will open a private channel.

Please include what you can: what you did, what happened, what you expected, and the impact you
believe it has. A proof of concept helps; a working exploit is not required.

**Expect a first response within 5 working days.** We will tell you whether we can reproduce it, what
we intend to do, and when. We will credit you when the fix ships, unless you prefer otherwise.

## Scope

In scope: this repository's code and the deployed application. Particularly welcome:

- Anything that lets one account read or write another account's data. Authorization is enforced at
  the database with row-level security, and any bypass of it is our highest-severity class.
- Anything that makes the agent act outside its mandate — sending on a channel with no valid mandate,
  ignoring the daily quota, or surviving the emergency stop.
- **Prompt injection through job-posting content.** A job description is text written by a third
  party and fed to a language model that then writes emails and fills forms. If you can make posted
  content cause an outbound action, a changed destination, or data exfiltration, that is a real
  vulnerability and we want it.
- Forged, altered, or missing application receipts.
- Anything that leaks a user's job search to a third party.

Out of scope: findings that require a compromised user device or account; volumetric denial of
service; missing hardening headers with no demonstrated impact; automated scanner output with no
analysis; social engineering of the maintainer.

## Please do not

Test against other people's data or real employer application forms. If you need a target, ask and we
will provision an isolated account. Never submit a real job application as part of a test.

## Our own commitments

- Secret scanning with push protection is enabled; dependency and code scanning run on every pull
  request.
- Changes touching authentication, outbound sending, payments, personal data, or model context
  require a committed security review before merge — see `docs/engineering/`.
- No credential is ever committed. If one ever is, it is rotated first and removed second.
