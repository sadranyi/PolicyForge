# Acme Corp — Secure Coding Standard

**Version:** 3.2
**Last reviewed:** 2026-03-15
**Owner:** Application Security Team

---

## 1. Scope

This standard applies to all production code written in TypeScript, C#, Python, and Java, and to any service deployed outside the corporate network. The standard covers application code; it does not cover infrastructure-as-code (see the Cloud Security Standard) or data engineering pipelines (see the Data Platform Standard).

Out of scope: research notebooks, internal tooling not exposed beyond the engineering VPN, and third-party SaaS configurations.

## 2. References

This standard depends on and references:
- **Acme Data Classification Policy v2.1** — the data classification tier definitions used throughout.
- **Acme Incident Response Policy v4.0** — the procedures invoked when a security finding is identified.

Control intensity in this standard scales with classification tier: Public, Internal, Confidential, Restricted.

## 3. Threat modeling

Threat modeling is required:
- Before any new external-facing service ships.
- On any architectural change that introduces a new trust boundary.
- On any change that begins processing data of a higher classification tier.

The team uses STRIDE as the default approach. Threat models are stored in the service's repository under `/docs/security/threat-model.md`. The Application Security team owns the threat-model template and reviews completed models.

## 4. Input handling

### 4.1 Input validation

Every input crossing a trust boundary must be validated. We require allowlist (positive) validation as the default approach; denylist validation is permitted only with documented justification.

Categories that always require validation:
- HTTP request parameters (path, query, body, headers)
- File uploads (type, size, content)
- Message queue payloads
- Deserialized objects from any source
- Data crossing a service-to-service boundary

### 4.2 Injection prevention

The following are prohibited:

- **SQL:** No string concatenation in queries. Use parameterized statements or vetted ORM patterns. Approved: Entity Framework (parameterized), TypeORM (with parameterized queries), Prisma, SQLAlchemy core/ORM.
- **Command execution:** No `shell=True` or equivalent on untrusted input. Prefer language-native APIs over shelling out.
- **LDAP, XPath, NoSQL:** Use library APIs that handle escaping. Do not construct queries from untrusted text.

### 4.3 Output encoding

Context-aware output encoding is required for any user-controllable data rendered to a browser. Use the framework's built-in escaping (Razor's automatic HTML encoding, React's JSX auto-escaping, server-side template engines with autoescape enabled).

`dangerouslySetInnerHTML` and equivalents are prohibited without explicit Application Security review.

## 5. Authentication

### 5.1 Strong authentication

Authentication is required for all non-public endpoints. Multi-factor authentication is required for:
- Any administrative interface
- Any access to production systems
- Any code-signing or key-management interface

Acme uses Okta as the SSO / IdP standard. WebAuthn (passwordless) is the target end-state for all internal applications by end of 2026.

### 5.2 Password handling

If an application stores passwords (most should not — prefer SSO), the following requirements apply:
- **Algorithm:** Argon2id (preferred), scrypt, or bcrypt with appropriate parameters.
- **Prohibited:** MD5, SHA-1, unsalted SHA-256 for password storage.
- Minimum work factors are reviewed annually by the Application Security team.

### 5.3 Session management

- Tokens generated with a CSPRNG, minimum 128 bits of entropy.
- Cookies set with HttpOnly, Secure, and SameSite=Lax (or Strict where compatible).
- Access token TTL bounded; refresh token rotation required.
- Server-side session invalidation on logout, password change, and permission revocation.

## 6. Authorization

### 6.1 Authorization model

Acme uses Role-Based Access Control (RBAC) with attribute-based extensions for object-level access. The principle of least privilege applies: every grant must be justifiable. Access reviews occur quarterly.

### 6.2 Server-side enforcement

Authorization checks are required server-side on every state-changing request and every read of non-public data. UI-level access control (hiding buttons) is a usability feature, not a security control.

Object-level checks are required: the user can not only call this endpoint, but can access this specific object. IDOR (Insecure Direct Object Reference) is a class to test for in every code review of authz-sensitive paths.

## 7. Cryptography

### 7.1 Approved algorithms

| Operation | Approved | Prohibited |
|---|---|---|
| Symmetric encryption | AES-256-GCM (or other AEAD) | DES, 3DES, RC4 |
| Asymmetric | RSA-2048+, ECDSA P-256/P-384, Ed25519 | RSA < 2048 |
| Hashing (general) | SHA-256, SHA-384, SHA-512 | MD5, SHA-1 |
| Hashing (passwords) | Argon2id, scrypt, bcrypt | All of the above; unsalted hashes |
| MAC | HMAC-SHA-256+ | — |
| TLS | 1.2 minimum, 1.3 preferred | < 1.2 |

### 7.2 Key management

All cryptographic keys and application secrets must be stored in a managed secret store. Approved stores:
- Azure Key Vault (primary)
- HashiCorp Vault (legacy services, migration to Azure Key Vault planned)

Keys must never be committed to source repositories. Key rotation schedule:
- Restricted-tier keys: 90 days
- Confidential-tier keys: 180 days
- Internal-tier keys: 365 days

### 7.3 Secret handling in code

Hardcoded secrets, credentials, API keys, tokens, and private keys in source code or configuration files committed to the repository are forbidden.

The CI pipeline runs gitleaks against every PR; a finding fails the build. The pre-commit hook (managed via Husky for Node, Husky.NET for .NET) runs the same scan locally.

If a secret is accidentally committed: rotate the secret immediately, then file an incident ticket. The history must be purged after rotation; the Application Security team owns the purge procedure.

## 8. Dependencies & supply chain

### 8.1 Vulnerability management

Continuous dependency scanning is required. Approved tools: Dependabot (GitHub-native), Snyk (Acme-licensed). Every PR runs SCA; a Critical finding fails the build.

Remediation SLAs:
- Critical CVE: 7 days
- High CVE: 30 days
- Medium / Low: with the next regular release cycle

Exceptions to SLA require named approval from the Application Security team and a documented compensating control.

### 8.2 Software bill of materials (SBOM)

Every production artifact must have an SBOM generated as part of its build, in CycloneDX format. SBOMs are stored in the artifact registry alongside the artifact, with the same retention policy. The team uses Syft for SBOM generation.

### 8.3 Approved dependency sources

Approved package sources:
- npm: official npmjs.org registry
- NuGet: NuGet.org
- Maven: Maven Central
- PyPI: official PyPI

Internal packages use the `@acme` npm scope, the `Acme.*` NuGet namespace, and the `acme.` PyPI prefix, hosted on the internal Artifactory feed. Where the ecosystem supports provenance verification (npm provenance, PyPI Trusted Publishers, Sigstore), the team enables it.

## 9. Logging, error handling, monitoring

### 9.1 Required security logging

The following events must be logged:
- Authentication events — success and failure, with source IP
- Authorization failures (not all successes — this avoids log volume issues)
- Privilege escalations and role changes
- Access to data classified Confidential or Restricted
- Cryptographic key usage events

Logs are retained per the Acme Logging Policy (90 days hot, 1 year cold). All security events are forwarded to the Acme SIEM.

### 9.2 Sensitive data must not appear in logs

The following are prohibited from logs:
- Authentication credentials, session tokens, API keys, private keys
- PII and Confidential-class data — must be redacted before logging
- Full request/response payloads of sensitive endpoints — must be redacted or summarized

The Acme.Logging library provides a redaction utility (`RedactSensitive`) that handles common patterns. Unit tests must cover redaction in any new logger.

### 9.3 Error handling

Error responses to external callers must be generic: a correlation ID, an HTTP status, no internal detail. Detailed errors with stack traces are logged internally only. Framework debug pages are disabled in production builds.

The standard error-response shape for HTTP services is documented in the API Style Guide.

## 10. Process & assurance

### 10.1 Code review

Every change to a production-bound branch requires a code review. Two reviewers are required for changes that touch:
- Authentication or authorization code paths
- Cryptographic operations or key management
- External integrations and trust-boundary changes
- Files flagged by the Application Security team as security-sensitive

### 10.2 SAST in CI

Static application security testing is required on every PR. Tools in use: GitHub CodeQL (default for all repos), Semgrep (with the Acme custom ruleset). Critical findings fail the build.

SAST suppressions require Application Security approval, are recorded in `/.acme/sast-suppressions.yml`, and are reviewed quarterly.

### 10.3 DAST and penetration testing

DAST scanning of pre-production environments runs weekly for actively-developed services using OWASP ZAP. External penetration tests are commissioned annually for tier-1 services.

DAST findings follow the same SLAs as SCA findings (Section 8.1).

### 10.4 Incident response

Security findings — in-prod Critical CVE, leaked secret, customer-reported security issue, prompt injection or AI agent misbehavior — invoke the Acme Incident Response Policy. The on-call rotation for application security is documented in the on-call runbook; the channel for engineers to report a suspected security issue is `#sec-report` in Slack, monitored 24/7.

## 11. Training

Secure coding training is required during onboarding for all engineers, with a refresh annually or on major standard revisions. Acme uses Secure Code Warrior; non-completion blocks production access after a 30-day grace period.

---

*This standard is reviewed at least annually by the Application Security team and revised whenever a Critical post-incident review reveals a relevant gap.*
