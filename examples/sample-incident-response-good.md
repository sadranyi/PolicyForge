# Acme Corp — Incident Response Policy

**Version:** 4.1
**Last reviewed:** 2026-04-01
**Owner:** Director of Security Operations
**Approved by:** Chief Information Security Officer

---

## 1. Scope and ownership

This policy applies to all systems operated by or on behalf of Acme Corp, all personnel (employees, contractors, vendors with system access), and all incidents affecting confidentiality, integrity, or availability of Acme assets or customer data.

The **Director of Security Operations** is the policy owner and the head of the standing Incident Response Team (IRT). The IRT comprises:

- **Incident Coordinator** (Director of Security Operations)
- **Technical Responders** (rotating roster of senior engineers from Platform, Application Security, and SRE)
- **Legal Lead** (Acme General Counsel or designate)
- **Communications Lead** (Director of Marketing Communications, for external comms; HR Business Partner, for internal comms)
- **Executive Sponsor** (CISO; CEO for material incidents)

The **Acme CSIRT** (Computer Security Incident Response Team) provides 24/7 detection and triage capability via the Security Operations Center.

## 2. Definitions

This policy uses three operational categories:

- **Event** — any observed occurrence in a system or network. Examples: a single failed login, a port scan, a config change, a routine alert. Events are logged but do not trigger response.
- **Incident** — an event that violates security policy, threatens the confidentiality, integrity, or availability of an Acme system or customer data, or causes harm to the organization or its customers. Examples: confirmed unauthorized access, data exposure, ransomware detection, customer-reported security issue.
- **Observation** — a finding that doesn't meet incident criteria but warrants follow-up. Examples: misconfigured security control, suspicious-but-legitimate user activity, third-party vulnerability disclosure that doesn't appear to affect us.

## 3. Reference to data classification

Incident response intensity scales with data classification, defined in the [Acme Data Classification Policy v3.2](/policies/data-classification.md). An incident involving Restricted or Confidential data automatically triggers immediate Legal notification regardless of operational severity.

## 4. Severity classification

Acme uses a four-tier severity model. Severity is set on incident declaration and may be revised as scope becomes clear.

| Tier | Definition | Examples | Response time |
|---|---|---|---|
| **S1 — Critical** | Active, ongoing harm; major customer impact; regulated data confirmed exposed; ransomware in production. | Customer database compromised; production service outage with security cause; large-scale phishing leading to credential compromise. | Acknowledge: 15 min. Containment: 1 hour. |
| **S2 — High** | Confirmed security incident with limited scope; possible regulated-data exposure; significant operational impact. | Single-account compromise; secrets pasted into AI service; agent misbehavior; isolated malware. | Acknowledge: 30 min. Containment: 4 hours. |
| **S3 — Medium** | Confirmed incident with no regulated data and limited operational impact; needs response but not crisis. | Failed phishing attempt that some users clicked; minor configuration exposure; suspected insider misuse without confirmed data access. | Acknowledge: 4 hours. Containment: 1 business day. |
| **S4 — Low** | Confirmed but minor; tracked for awareness but no immediate action required. | Successfully blocked attack; reported issue that turned out to be benign. | Acknowledge: 1 business day. |

## 5. Escalation thresholds

Notification timelines from incident declaration:

| Severity | Within 30 min | Within 1 hour | Within 4 hours | Within 24 hours |
|---|---|---|---|---|
| **S1** | On-call, IR Coordinator, Legal Lead, CISO | CEO, CFO (if financial impact), Head of Customer Success | Board (if material) | All affected customers informed (Legal-led) |
| **S2** | On-call, IR Coordinator | Legal Lead (if customer / regulated data possible), CISO | — | Customer notification analysis complete |
| **S3** | On-call | IR Coordinator | CISO (next business day) | — |
| **S4** | On-call | — | — | — |

Times are clock times (e.g., "30 minutes from declaration"), not vague timelines. The on-call engineer who declares an incident is responsible for ensuring the first-tier notifications go out; the IR Coordinator owns the rest.

## 6. On-call rotation

Acme maintains 24/7 on-call coverage via PagerDuty. Two rotations:

- **Tier 1** — SOC analysts, primary detection. Primary engineer acknowledges within 15 minutes; auto-escalation to secondary if not acknowledged.
- **Tier 2** — Senior IRT responders, called for confirmed incidents at S2 and above. One-week rotations with documented handoff.

The on-call schedule is maintained in PagerDuty and reviewed monthly. Responders are required to confirm availability at handoff.

## 7. Detection and triage

### 7.1 Detection sources

The IRT triages incidents originating from any of the following:

- SIEM alerts (Acme uses Splunk Enterprise Security)
- Endpoint detection alerts (CrowdStrike Falcon)
- Customer reports (via Customer Success or `security@acme.example`)
- Internal reports (Slack `#sec-report`, monitored 24/7)
- External reports (CERT, vulnerability disclosure, law enforcement)
- Third-party notifications (vendor security advisories, partner reports)
- AI provider notifications (data deletion requests, content-policy alerts)

### 7.2 Initial triage

Every incoming alert or report follows the same intake flow:

1. **Acknowledge** — primary on-call confirms receipt within stated SLA.
2. **Validate** — confirm the report is a genuine incident (not a false positive). False positives are logged as Observations.
3. **Classify** — assign initial severity per § 4. Severity may be revised.
4. **Open record** — create incident record in our IR tracker with required fields: time of detection, source, affected systems, initial severity, classifying responder.
5. **Escalate** — apply notification matrix per § 5.

## 8. Containment, eradication, and recovery

We follow the NIST SP 800-61 lifecycle. The four phases are distinct steps with explicit transition criteria.

### 8.1 Containment

Stop the immediate harm. Two sub-phases:

- **Short-term containment** — actions taken in the first hours to limit blast radius: network isolation of affected systems, disabling compromised accounts, blocking malicious domains, deploying emergency firewall rules.
- **Long-term containment** — sustainable measures while eradication is planned: rebuilding affected systems on clean infrastructure, rotating credentials that may have been exposed, applying compensating controls.

Containment is complete when affected systems are isolated AND all credentials potentially exposed have been rotated.

### 8.2 Eradication

Remove the root cause. Identify how the incident occurred and close that path:

- Patch the exploited vulnerability
- Remove malware artifacts from all systems
- Close the misconfiguration
- Revoke and replace any compromised credentials, certificates, or keys

Eradication is complete when independent verification confirms the root cause is removed and not present elsewhere in the environment.

### 8.3 Recovery

Restore normal operations with verification:

- Bring systems back into service after eradication is verified
- Monitor for return of indicators of compromise
- Validate user access and data integrity
- Document the recovery sequence for the post-incident review

Recovery is complete when systems are operating normally AND post-recovery monitoring (typically 72 hours) shows no recurrence.

### 8.4 Lessons learned

Feeds the post-incident review (see § 13).

## 9. Evidence preservation

For any S1 or S2 incident, and any incident that may involve regulated data or potential litigation, evidence must be preserved before remediation begins where operationally possible.

Required evidence:

- **System logs** — preserve before normal log rotation; copy to forensic storage
- **System state** — memory dump and disk image for any host suspected of compromise
- **Network captures** — packet captures from relevant network segments
- **Screenshots** — of affected interfaces, alerts, malicious content
- **Internal communications** — Slack channels, email, bridge call recordings (with consent notice posted in the channel)
- **Chain of custody** — every transfer of evidence is logged with timestamp, transferor, recipient

The IR Coordinator owns evidence custody. Default retention is 1 year minimum; longer if the Legal Lead places a litigation hold.

## 10. Communications

### 10.1 Internal communications

For every declared S1 or S2 incident:

- A dedicated Slack channel is created using convention `#incident-YYYYMMDD-shortname` (e.g., `#incident-20260415-ransomware-staging`)
- A bridge call begins within 30 minutes for S1; within 1 hour for S2. Required attendees: Incident Coordinator, primary technical responder, Legal Lead (S1 only initially)
- **Status updates** are posted on a defined cadence: every 30 minutes for S1, every hour for S2, until containment is achieved
- **Audience-tailored summaries** are posted separately for executive leadership (impact-focused, no technical jargon) and engineering (technical detail, including IOCs and remediation steps)

### 10.2 External customer communications

**All customer-facing incident communications are Legal-led.** No engineer, support agent, or operations responder communicates externally about an incident without explicit Legal Lead approval.

Process:

1. Legal Lead determines whether customer notification is required (per regulatory analysis, contractual obligations, and ethical considerations)
2. If required, Legal Lead determines audience scope (specific affected accounts, segment, or all customers)
3. Communications Lead drafts using pre-approved templates where possible
4. Final language reviewed by Legal Lead, CISO, and (for material incidents) CEO before sending
5. Customer Success delivers individual notifications to affected accounts; PR/Communications handles broader public disclosure if appropriate

### 10.3 Regulatory notification

The following regulatory regimes apply to Acme operations. Notification windows are tracked from incident **awareness**, not from confirmation.

| Regime | Window | Trigger | Owner |
|---|---|---|---|
| **GDPR Article 33** | 72 hours | Personal data breach unless unlikely to risk individuals' rights | Data Protection Officer + Legal Lead |
| **NIS2 (EU 2022/2555)** | 24-hour early warning, 72-hour incident notification, 1-month final report | Significant incident affecting essential / important services | Legal Lead |
| **SEC Form 8-K Item 1.05** | 4 business days from materiality determination | Material cybersecurity incident | General Counsel + CFO |
| **HIPAA Breach Notification** | 60 days (individual); 60 days (HHS for ≥ 500 affected); annual log otherwise | Breach of unsecured PHI | Privacy Officer |
| **State breach notification laws** | Varies by state; 30–60 days typical | Breach of personally identifiable information | Legal Lead |

The Legal Lead, in consultation with the Data Protection Officer, owns the analysis of which regimes apply to a given incident and triggers the notification process accordingly.

## 11. AI-specific incident classes

Modern AI systems introduce incident classes that traditional IR programs are not configured to handle. The following are recognized incident classes at Acme:

### 11.1 Data leakage to AI service

**Definition:** Customer data, secrets, or Confidential-class data was entered into a non-tenant-bound AI service (consumer ChatGPT, free Claude, public Gemini, etc.).

**Triage steps:**

1. Identify what data was pasted, into which service, by whom, when
2. Classify the receiving service: tenant-bound vs. consumer; training-on vs. training-off
3. Engage the AI provider's privacy team for deletion request:
   - Anthropic: `privacy@anthropic.com`
   - OpenAI: `dsar@openai.com`
   - Google: privacy form via Workspace admin
4. Rotate any secrets or credentials present in the leaked data
5. Apply customer-notification process if customer data was involved (this is a disclosure to a third-party processor)
6. Apply regulatory notification analysis — GDPR specifically may apply

### 11.2 Agent or automation misbehavior

**Definition:** An AI agent, MCP server, or AI-driven automation took an action the user did not intend, or had access to systems beyond the user's authorization.

**Triage steps:**

1. Stop the agent immediately
2. Preserve the session log and the agent's action log (do not trust the conversation log alone — verify what actions were actually taken)
3. Enumerate blast radius: what systems were touched, what data was accessed or modified, what credentials the agent used
4. Rotate any credentials the agent had access to
5. Determine root cause: misinterpretation, prompt injection, scope misconfiguration, or compromised integration
6. Apply IR lifecycle from § 8

### 11.3 Prompt injection

**Definition:** A model received malicious instructions embedded in untrusted content (a document, web page, file, or third-party API response) and acted on them.

**Triage steps:**

1. Preserve the inbound content that contained the injection
2. Determine the attack vector: direct (user paste) or indirect (model fetched content from a compromised source)
3. Assess what action the injection caused
4. Update detection patterns and content-handling rules
5. Treat as S2 by default; escalate based on action triggered

Reference: OWASP LLM Top 10 (LLM01) for technical detail.

## 12. Tabletop exercises

The IRT conducts tabletop exercises **quarterly**. Exercises rotate through scenarios covering different incident classes:

- Q1: External attacker scenario (e.g., compromised cloud account)
- Q2: Insider scenario (e.g., departing employee data exfiltration)
- Q3: Third-party / supply chain scenario (e.g., compromised vendor)
- Q4: AI-related scenario (e.g., customer-data-into-LLM, agent misbehavior)

Every exercise produces an after-action report identifying gaps in the policy, runbooks, or tooling, with corrective actions assigned to named owners and tracked through closure.

## 13. Onboarding and training

Incident response awareness training is required:

- During onboarding for all engineering and operations staff, before production access is granted
- Annual refresh tied to the Q4 tabletop exercise
- Specific module on AI-related incidents for any role using AI tools (engineering, customer support, marketing)

The training covers: how to recognize a potential incident; how to report it; channel (`#sec-report`, `security@acme.example`, PagerDuty for critical); evidence preservation expectations; what NOT to do (don't delete, don't remediate without authorization, do screenshot).

Non-completion blocks production access after a 30-day grace period.

## 14. Post-incident review

Every Critical (S1) and High (S2) incident requires a post-incident review (PIR), conducted within **10 business days** of incident closure.

### 14.1 PIR format

Documented in standard template covering:

- **Timeline** — minute-by-minute account from detection to closure
- **What happened** — factual narrative without attribution of blame
- **What we did well** — controls and responses that worked
- **What we did poorly** — gaps, delays, errors
- **Root cause(s)** — systemic causes, not individual actions
- **Corrective actions** — specific commitments with named owners and due dates

### 14.2 Tracking

Corrective actions appear in a reviewed backlog (Acme uses Jira project SEC-CA) until closed. Open actions are reviewed monthly by the IRT.

### 14.3 Executive review

Any S1 incident's PIR is reviewed by the executive team. Material incidents (per SEC determination) are reviewed at the Board Audit Committee.

### 14.4 Non-punitive principle

**Post-incident reviews are non-punitive.** The objective is to identify systemic causes — gaps in tooling, process, training, or design — that enabled the incident, not to identify individual fault.

Engineers participating in PIRs are expected to be candid. Their candor will not be used against them in performance review or disciplinary action. This is a standing policy commitment, not a per-incident grace.

This non-punitive principle does not extend to deliberate misconduct: actions taken with malicious intent, or in deliberate violation of policy after training, are handled separately under HR procedures and are not subject to this protection.

---

*This policy is reviewed at least annually by the Director of Security Operations and revised whenever a Critical PIR identifies a relevant gap.*

*Last reviewed: 2026-04-01.*
