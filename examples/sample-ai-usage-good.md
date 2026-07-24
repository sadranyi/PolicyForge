# Acme Corp AI Usage Policy

**Version:** 2.0
**Policy owner:** Chief Information Security Officer (security@acme.example)
**Effective date:** 2026-01-15
**Next review:** 2026-07-15 (semi-annual review cadence)

## 1. Purpose and scope

This policy governs the use of AI services, AI assistants, coding agents, and AI-enabled features by all Acme Corp employees and contractors. It applies to hosted AI services, self-hosted models, browser extensions with AI capabilities, and AI features embedded in approved SaaS products.

## 2. Data rules

### 2.1 Classification

All data handled at Acme is assigned a classification tier under the Acme data classification policy: **Public, Internal, Confidential, or Restricted**. The classification tier of the data involved determines which AI services, if any, may process it.

- **Public** data may be used with any approved AI service.
- **Internal** data may be used only with AI services on the approved vendor list.
- **Confidential** and **Restricted** data require the enhanced controls in section 2.2 and explicit approval from the data owner.

### 2.2 Customer data

Customer data must not be entered into any AI service, hosted or self-hosted, unless the service is on the approved list for customer data processing AND a data processing agreement (DPA) covering AI processing is in place with the vendor. Production data must not be used for AI experimentation or prompt testing under any circumstances; use synthetic or anonymized datasets instead.

### 2.3 Decision criteria for new use cases

Before adopting an AI tool for a workflow, the requester and the security team evaluate:

1. **Regulatory scope** — whether the data or workflow is subject to GDPR, CCPA, HIPAA, or other applicable regulation, including any personally identifiable information involved.
2. **Contractual confidentiality obligations** — customer and partner agreements may restrict third-party processing.
3. Data classification tier of all inputs and outputs.
4. Vendor posture per section 4.

## 3. Accounts

### 3.1 Personal accounts

Use of personal AI accounts for company work is discouraged and permitted only with compensating controls. Every personal account used for work must be registered with IT, and the user must enable the vendor's **training opt-out** so company inputs are not used for model training. Personal accounts may never process Confidential or Restricted data.

### 3.2 Deprovisioning

Offboarding checklists include AI accounts: when an employee or contractor is departing, IT revokes company AI service access on the last working day, and the employee must delete company-related conversation history from any registered personal AI account before leaving.

## 4. Vendors and tools

### 4.1 Vendor review

New AI tools require a vendor security assessment before approval. The review covers the vendor's SOC 2 Type II report (or equivalent), data retention and training practices, a signed data processing agreement (DPA), sub-processor list, and breach notification terms.

### 4.2 Meeting tools

AI meeting transcription and summarization tools (including but not limited to Otter, Fireflies, and Zoom AI Companion) are treated as AI vendors and require the same review. Meeting recording or transcription requires informing all participants; externally attended meetings require the external party's consent before any AI notetaker joins.

## 5. Threat awareness

### 5.1 Prompt injection

All staff using AI assistants that browse, read email, or process documents must be aware of prompt injection, including indirect injection, where malicious instructions are hidden in untrusted content such as web pages, attachments, or inbound messages. AI assistants must not be granted simultaneous access to untrusted input sources and sensitive data or destructive actions without human review in between.

### 5.2 Agent connectors and MCP

Connecting AI agents to internal systems via the Model Context Protocol (MCP) or similar connector mechanisms requires registration and approval by the security team. Only MCP servers from the internal approved catalog may be used; agent registration records the systems accessed, the scopes granted, and the accountable owner.

MCP configuration (`.mcp.json`) for every repository is committed to version control and reviewed as code; local, uncommitted MCP server definitions on work machines are prohibited. Before any agent tool or MCP connector is enabled, its granted tool permissions and scopes are reviewed under least privilege, and any connector with write, delete, or sensitive-read scope requires elevated approval. The approved MCP server allowlist is owned by the security team.

### 5.3 Agent blast radius

Every autonomous agent deployment must have a named agent owner, a documented blast radius describing the systems it can affect, scoped permissions limited to what the task requires, and a tested kill-switch that immediately halts the agent and revokes its credentials.

## 6. Engineering rules

### 6.1 Secrets

Secrets, API keys, credentials, passwords, tokens, and connection strings must never be pasted into an AI prompt, chat, or conversation with any AI service. Repositories use pre-commit secret scanning, and any secret exposed to an AI service is treated as compromised and rotated immediately.

### 6.2 AI-generated code

All AI-generated code is subject to the same review standard as human-written code: a human pull-request review by someone other than the person who prompted the generation. For security-sensitive components, an additional domain reviewer is required. AI-generated code must not be merged without passing the standard CI security gates.

## 7. Governance

### 7.1 Incident response

AI-specific incident response procedures are maintained in the security team's AI incident runbook, covering data leakage to an AI service, prompt injection incidents, agent malfunction, and vendor breach. Suspected AI incidents are reported to security@acme.example within 24 hours and handled under the corporate incident response plan.

### 7.2 Training

All employees complete AI security training at onboarding and annually thereafter, and sign an annual attestation confirming they have read and will follow this policy.

### 7.3 Review and compliance

This policy is reviewed semi-annually by the policy owner. Compliance mapping is maintained against GDPR, CCPA, and, where applicable to customer engagements, HIPAA; the mapping is available from the compliance team.
