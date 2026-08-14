# Security Policy

## Supported deployments

letsboulder is a hosted application and does not publish versioned releases.

| Deployment | Security support |
|---|---|
| Current production deployment at [letsboulder.com](https://letsboulder.com) | Supported |
| Development, preview, or local deployments; older commits; and third-party forks | Not supported |

Security fixes are assessed against the current production deployment. If you believe an unsupported deployment reveals a vulnerability that also affects production, please report it privately.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/basecamp-dev-app/letsboulder/security/advisories/new). You will need to sign in to GitHub to submit a report.

Do not disclose vulnerability details in a public issue, discussion, or pull request. The private advisory is the approved and monitored reporting route.

Include as much of the following as you can:

- the affected URL or component;
- clear reproduction steps;
- the security impact and who could be affected;
- any required accounts, permissions, configuration, or other prerequisites; and
- a minimal proof of concept that demonstrates the issue without accessing or changing other users' data.

Reports about suspected vulnerabilities are handled through the private route above. For ordinary bugs, feature requests, and support questions that do not contain sensitive security details, use [GitHub Issues](https://github.com/basecamp-dev-app/letsboulder/issues).

## What to expect

This project currently has one maintainer. Reports are reviewed and acknowledged on a best-effort basis as capacity permits; there is no guaranteed response, update, or remediation timeline.

When possible, the maintainer will share an update after a material change, such as completing triage, preparing a fix, or deciding that the report is not a vulnerability. Please keep the report private while it is being assessed and coordinate any public disclosure with the maintainer.

## Responsible disclosure and testing

Please:

- test only with accounts and data you own or are explicitly authorized to use;
- use the minimum access and data necessary to demonstrate the issue;
- stop testing and report immediately if you encounter another user's data;
- do not access, alter, download, delete, or retain another user's data;
- do not disrupt the service, degrade availability, send high-volume automated traffic, use social engineering, or attempt to maintain persistent access; and
- give the maintainer a reasonable opportunity to investigate and address the report before publishing details.

This policy does not create a legal safe harbor or authorize activity that would otherwise be unlawful.
