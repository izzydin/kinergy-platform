# Security Policy

## Supported Versions

Only the latest release on the `main` branch is actively supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| Main    | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of the Kinergy Platform seriously. If you discover a security vulnerability, please follow responsible disclosure practices.

### Process

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email your findings directly to `security@kinergy-platform.com` (or contact the lead maintainers).
3. Include detailed steps to reproduce the vulnerability, impact analysis, and potential remediation steps.

### Expected Response

- **Initial Response:** Within 48 hours acknowledging receipt of your report.
- **Status Updates:** Every 5 business days until resolution.
- **Disclosure:** Once a patch is released, a public disclosure will be published with attribution (unless you prefer anonymity).

## Security Best Practices

- Never commit sensitive secrets, credentials, or private API keys to the repository.
- Ensure strict TypeScript typing and sanitize all input at application boundaries.
- Static analysis and security scanning are enforced on all PR submissions.
