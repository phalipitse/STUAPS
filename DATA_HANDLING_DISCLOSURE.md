# Data Handling Disclosure for STUAPS

**Effective Date:** August 8, 2026  
**Last Updated:** August 8, 2026  
**Version:** 1.0

---

## Executive Summary

This document provides transparent disclosure of how STUAPS handles, stores, processes, and protects user data. It's designed for administrators, compliance officers, and stakeholders to understand STUAPS's data handling practices.

**Key Commitments:**
- ✅ End-to-end encrypted transmission (HTTPS/TLS)
- ✅ Industry-standard encryption and hashing
- ✅ Multi-tenant data isolation
- ✅ Compliance with POPIA (South African data protection law)
- ✅ GDPR-compliant data processing for international users
- ✅ No sale or sharing of personal data for marketing

---

## 1. Data Categories & Classification

### 1.1 Personal Data Collected

| Category | Examples | Purpose | Retention |
|----------|----------|---------|-----------|
| **Authentication** | Email, username, password hash | Account access & security | Duration of account |
| **Identity** | Full name, contact number, job title | User identification & communication | Duration of account |
| **Organizational** | Institution name, property addresses, tenant details | Service delivery & multi-tenancy | Duration of subscription |
| **Student Data** | Student names, student numbers, surnames, contact details | Invoice reconciliation, reporting | Duration of subscription |
| **Financial Data** | Invoices, amounts, payment records, billing history | Billing, reconciliation, financial reporting | 7 years (tax compliance) |
| **Operational** | Pest control records, payroll data, financial statements | Service functionality | Duration of subscription |
| **Session Data** | Session tokens, cookies, login timestamps | Security & authentication | Expires with session |
| **Usage Analytics** | Pages visited, features used, time on page (anonymized) | Service improvement, security monitoring | 1 year |
| **Communication** | Support tickets, email inquiries, feedback | Support & service improvement | 7 years (records) |
| **Technical** | IP address, device type, browser, OS, error logs | Troubleshooting, security, performance | 1 year |

---

## 2. Data Collection Methods

### 2.1 Active Data Collection

**User-Provided:**
- Account registration (email, password, full name)
- Profile information (organization, role, contact details)
- Business operations data (uploaded invoices, student records, properties)
- Support inquiries and feedback

**How it's Collected:**
- Web forms and account settings
- CSV uploads for bulk data import
- API calls from your systems
- Manual data entry in the app

### 2.2 Passive Data Collection

**Automatic Collection:**
- Session cookies (authentication state)
- Login attempts and timestamps
- Feature usage (pages visited, actions taken)
- Technical information (IP address, device, browser)
- Error logs and crash reports

**Collection Method:**
- Browser cookies and local storage
- Server-side session logging
- Application performance monitoring (APM)
- Error tracking service

### 2.3 What We DON'T Collect

❌ We do NOT intentionally collect:
- Microphone, camera, or location data
- Keyboard activity or keystroke logging
- Biometric data
- Credit card numbers (handled by Paystack)
- Social media profiles or browsing history
- Genetic or health information

---

## 3. Data Storage & Infrastructure

### 3.1 Where Data is Stored

| Data Type | Storage Location | Provider | Encryption |
|-----------|------------------|----------|------------|
| **Application Data** | PostgreSQL Database | Neon (US-East region) | At-rest encryption |
| **Session/Cache** | In-memory session store | PostgreSQL (via Neon) | Encrypted connection |
| **File Uploads** | Application filesystem | Vercel (US-East region) | HTTPS only |
| **Backup Copies** | Automated backups | Neon automated backups | Encrypted |
| **Logs & Monitoring** | Application logs | Vercel logging | Log retention policy |

### 3.2 Data Centers & Jurisdiction

- **Primary:** United States (Vercel, Neon hosting locations)
- **Database:** US-East (Neon PostgreSQL)
- **Backups:** Neon automatic backups (same region)

**Data Residency Notice:** If you require data to remain in South Africa, contact us to discuss on-premises or regional hosting options.

### 3.3 Backup & Redundancy

**Automated Backups:**
- Daily automated backups by Neon
- Retained for 30 days
- Geographically distributed (Neon standard practice)
- Encrypted and access-restricted

**Your Responsibility:**
- STUAPS backups are for disaster recovery, not compliance
- You should maintain independent backups of critical financial data
- Use our data export feature to create compliance backups

**Export Options:**
- CSV export for invoices, students, records
- JSON export for technical integrations
- Available in Account Settings → Data & Privacy

---

## 4. Data Security Measures

### 4.1 Encryption In Transit

**HTTPS/TLS:**
- All data in transit uses TLS 1.2 or higher
- All endpoints use HTTPS (no unencrypted HTTP)
- SSL/TLS certificates from Vercel/Let's Encrypt
- Perfect forward secrecy enabled

**API Communication:**
- All API requests require HTTPS
- Request signing with session tokens (SameSite cookies)
- Rate limiting to prevent brute force

**Example Request:**
```
GET https://api.stuaps.vercel.app/api/invoices
Authorization: Bearer <session-cookie>
Content-Type: application/json
```

### 4.2 Encryption At Rest

**Database Encryption:**
- PostgreSQL connections use SSL/TLS
- Neon provides encryption at rest (AES-256)
- Password hashes use bcrypt with 12-round salts
- API keys and secrets stored encrypted

**File Storage:**
- Uploaded files stored on Vercel (encrypted storage)
- Files served over HTTPS only
- No caching of sensitive files on CDN

**Example (Password Storage):**
```
Raw Password:    "MySecurePassword123"
Bcrypt Hash:     $2b$12$R9h/cIPz0gi.URNN3kh2OPST9/PgBkqquzi8Ag8Co2RQbs8.eOdme
(Hash never reversed, re-hashing for verification only)
```

### 4.3 Access Control & Authentication

**Session Management:**
- Secure session cookies (HttpOnly, SameSite=Lax)
- Session timeout after 7 days of inactivity
- Automatic logout from shared devices

**Role-Based Access Control (RBAC):**
- Super Admin: Full system access (Pits Marketing only)
- Tenant Admin: Full access to tenant's data
- Manager: View/edit operational data
- Viewer: Read-only access to reports

**Multi-Tenancy Isolation:**
- Tenant data strictly isolated in database
- Cross-tenant data access not possible even with admin credentials
- Separate encryption keys per tenant option (available on request)

**Example Database Query:**
```sql
-- Even an admin can only see their tenant's data
SELECT * FROM invoices 
WHERE tenant_id = ? -- Enforced at database level
```

### 4.4 Audit Logging

**What We Log:**
- Login attempts (successful & failed)
- Data modifications (who changed what, when)
- Admin actions and permission changes
- API access patterns
- Security-relevant events (failed decryption, access denials)

**Log Retention:**
- Security logs: 1 year
- Audit logs: 1 year (or 7 years if legally required)
- Access logs: 6 months

**Log Protection:**
- Logs are immutable (append-only)
- Sensitive data (passwords, tokens) never logged
- Logs encrypted and access-restricted to security team

---

## 5. Third-Party Data Processors

STUAPS uses third-party services to deliver the platform. These are "Data Processors" under POPIA and GDPR.

### 5.1 Infrastructure Providers

| Provider | Service | Data Handled | Legal Basis | DPA |
|----------|---------|--------------|-------------|-----|
| **Vercel** | Web Hosting | App code, session data, logs | Service contract | Yes |
| **Neon** | Database Hosting | All application data | Service contract | Yes |
| **Paystack** | Payment Processing | Payment method, billing info | Payment processing | Yes |

**Data Processing Agreements:**
- All third parties have signed Data Processing Agreements (DPAs)
- They commit to POPIA and GDPR compliance
- They sub-processors are documented and auditable

### 5.2 Operational Services

| Service | Data Accessed | Purpose | DPA Status |
|---------|---------------|---------|-----------|
| **Sentry (Error Tracking)** | Error logs, stack traces | Bug detection & fixing | Planned (limited) |
| **Google Analytics** | Anonymized usage stats | Traffic analysis | GDPR compliant |

**No Sentry/Analytics:** All usage data is anonymized; no personal data is sent to third-party analytics.

### 5.3 Geographic Data Transfers

**US-Based Hosting:**
- Vercel and Neon are US-based companies
- Data is stored in US data centers (US-East)
- Complies with POPIA (South African law allows transfers with safeguards)
- Complies with GDPR (adequacy decision for US-based processors; Standard Contractual Clauses in place)

**For GDPR Users:**
- EU Standard Contractual Clauses (SCCs) in place with Vercel and Neon
- Transfer Impact Assessment completed
- Supplementary safeguards documented

**For POPIA Users:**
- Cross-border transfer authorized under POPIA §72 (Data Subject Consent)
- Privacy Policy disclosure provided to data subjects
- Reasonable safeguards implemented

---

## 6. Data Processing & Retention Periods

### 6.1 Data Lifecycle

```
Data Collection → Storage → Processing → Usage → Retention → Deletion
     (Active)     (Secure)   (Encrypted)   (App)   (Governed)   (Secure)
```

### 6.2 Retention Schedule

| Data Type | Active Period | Retention After Closure | Deletion Method |
|-----------|---------------|------------------------|-----------------|
| **User Account** | Duration of subscription | 30 days notice period | Cryptographic erasure |
| **Student Records** | Duration of subscription | 7 years (tax records) | Secure deletion |
| **Invoices** | Duration of subscription | 7 years (legal requirement) | Retention in archive |
| **Payment Records** | Duration of subscription | 7 years (legal requirement) | Masked & archived |
| **Session Data** | Active session | Expires automatically | Session timeout |
| **Logs & Analytics** | Real-time | 1 year | Automated purge |
| **Backup Copies** | Daily backups | 30 days | Expiration policy |

### 6.3 Data Subject Requests

**Your Rights:**
- **Right to Access:** Request export of all your data
- **Right to Correction:** Update inaccurate information
- **Right to Deletion:** Request deletion (subject to legal holds)
- **Right to Portability:** Export in standard formats
- **Right to Restrict:** Limit processing of your data

**How to Submit:**
Email privacy@stuaps.com with:
- Request type (access, correction, deletion, etc.)
- Specific data or time period
- Your account email or tenant ID
- Proof of identity (if deleting on behalf of others)

**Response Time:**
- We respond within 30 days
- May request additional information
- Extensions allowed for complex requests (additional 60 days)

---

## 7. Compliance & Legal Frameworks

### 7.1 POPIA (Protection of Personal Information Act)

**South African Law Compliance:**

| POPIA Principle | STUAPS Implementation |
|-----------------|----------------------|
| **1. Lawfulness & Accountability** | Privacy Policy, DPAs with processors, audit logs |
| **2. Purpose Limitation** | Data used only for stated service purposes |
| **3. Further Processing** | Opt-out available for analytics |
| **4. Information Quality** | Users can correct personal data anytime |
| **5. Openness** | Transparent policies & documentation |
| **6. Security** | Encryption, access controls, regular audits |
| **7. Data Subject Participation** | Rights to access, correct, delete data |
| **8. Accountability** | Privacy impact assessments, incident response |

**Responsible Party:** Pits Marketing and Distribution  
**Information Officer:** privacy@stuaps.com

### 7.2 GDPR (General Data Protection Regulation)

**For EU/EEA Users:**

- **Legal Basis:** Contract performance (service delivery)
- **Data Protection Officer (DPO):** Contact privacy@stuaps.com
- **Standard Contractual Clauses (SCCs):** In place with Vercel and Neon
- **Data Transfers:** Authorized under GDPR Chapter 5
- **Subject Rights:** All GDPR rights honored (access, deletion, portability, etc.)

**GDPR-Specific:**
- No automated decision-making without consent
- Data minimization (we collect only necessary data)
- Purpose limitation (strict use restrictions)
- Storage limitation (retention periods defined above)

### 7.3 South African Consumer Protection Act (CPA)

STUAPS complies with CPA requirements for:
- Plain language policies
- Right to information (this document)
- Warranty obligations
- Liability limitations (Terms of Service)
- Dispute resolution procedures

---

## 8. Security Incidents & Breach Notification

### 8.1 Incident Response Procedure

**If a data breach is discovered:**

1. **Detection:** Automated systems and manual review identify incident
2. **Containment:** Affected systems isolated; continued operations maintained
3. **Investigation:** Forensic analysis to determine scope and impact
4. **Notification:**
   - Affected users notified within 72 hours
   - Regulators notified if required by law
   - Transparency statement published

### 8.2 Breach Notification Details

**You will be notified of:**
- Date and time of incident
- Data affected (what categories were exposed)
- Number of records impacted
- Steps we're taking to remediate
- What actions you should take

**Example Notification:**
> "On August 15, 2026, we discovered unauthorized access to our database from 14:32-14:45 UTC. Approximately 150 user accounts were affected. Passwords are hashed and not accessible. We recommend changing your password as a precaution. All access has been blocked and we are investigating."

### 8.3 Your Actions in Case of Breach

- Change your password immediately
- Monitor your account for suspicious activity
- Report unauthorized transactions to support@stuaps.com
- Consider contacting your bank/payment processor

### 8.4 Security Commitment

- We monitor for threats 24/7
- Regular penetration testing conducted
- Security patches applied within 24-48 hours
- Vulnerability disclosure program available
- Bug bounty program (details on request)

---

## 9. Automated Decision-Making & Profiling

### 9.1 What We Don't Do

❌ STUAPS does NOT:
- Use automated decision-making to deny service
- Create behavioral profiles for marketing
- Use AI to make decisions that affect your service
- Sell behavioral data to third parties

### 9.2 What We Do Automate

✅ We DO automate (with transparency):
- Invoice reconciliation status (flagging outstanding invoices)
- Pest control due date calculations (based on treatment history)
- Billing overage calculation (students exceeding plan limits)
- Fraud detection (unusual login patterns, payment anomalies)

**Important:** These are recommendations, not decisions. You always retain full control:
- You decide whether to send payment reminders
- You decide to treat a property for pest control
- You accept or dispute billing charges

---

## 10. Cookies, Tracking & Analytics

### 10.1 Essential Cookies

| Cookie | Purpose | Retention | Consent Required |
|--------|---------|-----------|------------------|
| `session_id` | Authentication & authorization | Session (7 days) | No (essential) |
| `csrf_token` | CSRF protection | Session | No (essential) |

### 10.2 Optional Cookies

| Cookie | Purpose | Retention | Consent Required |
|--------|---------|-----------|------------------|
| `preferences` | UI theme, language | 1 year | Yes (optional) |
| `analytics_id` | Anonymous usage tracking | 1 year | Yes (optional) |

**Opt-Out:**
- Disable optional cookies anytime in Settings → Privacy
- You can use STUAPS without optional cookies
- Essential cookies cannot be disabled (required for authentication)

### 10.3 Third-Party Tracking

❌ **We do NOT:**
- Use Google Analytics to track personal data
- Use Facebook Pixel or similar social media trackers
- Allow third parties to set tracking cookies

✅ **We DO:**
- Use anonymized analytics (IP masked, no cookies)
- Monitor performance via Vercel (server-side only)
- Track feature adoption (anonymized)

---

## 11. Data Portability & Migration

### 11.1 How to Export Your Data

**Via Web Interface:**
1. Login to STUAPS
2. Go to Settings → Data & Privacy
3. Click "Export Data"
4. Select data categories (invoices, students, records, etc.)
5. Download as CSV or JSON

**Available Formats:**
- **CSV:** For Excel/Google Sheets compatibility
- **JSON:** For technical integrations
- **PDF:** For printable records

**Example CSV Export:**
```csv
invoice_id,invoice_number,date,amount,status
1001,INV-2026-001,2026-08-01,45000,outstanding
1002,INV-2026-002,2026-08-02,50000,paid
```

### 11.2 Data Import to Other Services

**Supported Migrations:**
- Export and import to competitor platforms
- Export financial data to accounting software (Xero, QuickBooks)
- Export payroll data to payroll processors

**No Lock-In Policy:**
- We do not intentionally make migration difficult
- Data formats are standard (CSV, JSON)
- API available for programmatic access
- Support team assists with exports on request

---

## 12. User Consent & Opt-Outs

### 12.1 Required Consents

The following require explicit consent:

| Data Processing | Consent Method | Opt-Out Available |
|-----------------|----------------|-------------------|
| **Core Service** | Account signup | Cannot opt out (required for service) |
| **Marketing Emails** | Checkbox during signup | Yes (unsubscribe anytime) |
| **Usage Analytics** | Optional preferences | Yes (disable in Settings) |
| **Cookies** | Cookie banner | Yes (except essential) |
| **Data Transfers (GDPR)** | Privacy Policy acceptance | Can object via privacy@stuaps.com |

### 12.2 Revoking Consent

**You can revoke consent for:**
- Analytics tracking (Settings → Privacy)
- Marketing emails (unsubscribe link in every email)
- Optional cookies (Settings → Cookies)
- Future data processing (data controller contact)

---

## 13. Transparency & Accountability

### 13.1 Data Handling Certifications

STUAPS commits to:
- ✅ Annual privacy impact assessments
- ✅ Security audits by third parties
- ✅ Regular penetration testing
- ✅ ISO 27001 certification (target)
- ✅ SOC 2 Type II compliance (planned)

### 13.2 Public Disclosures

**We publish:**
- This Data Handling Disclosure (updated annually)
- Privacy Policy (version controlled)
- Security practices & incident reports
- Processor list (DPAs available upon request)

### 13.3 Independent Reviews

**Third-Party Audits:**
- Annual security audits scheduled
- Penetration testing conducted quarterly
- Results shared with security-conscious clients

**Audit Reports:** Request via privacy@stuaps.com (confidentiality agreement required)

---

## 14. Contact & Escalation

### 14.1 Privacy & Data Inquiries

**Primary Contact:**
- Email: privacy@stuaps.com
- Response time: 5 business days

**Data Protection Officer:**
- Email: dpo@stuaps.com (when appointed)
- Handles GDPR/POPIA-specific requests

**General Support:**
- Email: support@stuaps.com
- Website: stuaps.vercel.app/support

### 14.2 Complaints & Escalation

**Process:**
1. Contact privacy@stuaps.com with your concern
2. We investigate and respond within 30 days
3. If unsatisfied, escalate to legal@stuaps.com
4. Final appeal to regulatory authority (Information Regulator in South Africa; DPA in EU)

**South African Regulator:**
- Information Regulator (South Africa)
- Website: https://www.inforegulator.org.za/
- Email: complaints@inforegulator.org.za

**EU Regulator (if applicable):**
- Your national Data Protection Authority
- List: https://edpb.ec.europa.eu/about-edpb/board/members_en

---

## 15. Changes to This Disclosure

**Version History:**
- v1.0 - August 8, 2026 (Initial release for app store submission)

**Update Process:**
- Material changes published 30 days before taking effect
- Non-material clarifications published immediately
- "Last Updated" date reflects latest change

**Archive:** Previous versions available at privacy@stuaps.com

---

## 16. Acknowledgment

By using STUAPS, you acknowledge:
- You have read and understood this Data Handling Disclosure
- You consent to data processing as described
- You understand your rights and how to exercise them
- You accept our data handling practices

---

**Questions? Contact privacy@stuaps.com**

*This document is effective August 8, 2026 and applies to STUAPS v1.0.0 and later.*
