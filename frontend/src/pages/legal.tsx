import * as React from "react";

function TocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="link" href={href}>
      {children}
    </a>
  );
}

export function LegalPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Legal</h1>
        <p className="text-sm muted">
          Last updated: <span className="font-medium">March 8, 2026</span>
        </p>
        <p className="text-sm muted">
          This page contains our Terms of Service, Privacy Policy, and key risk disclosures. If you do not agree, do not
          use the Services.
        </p>
      </div>

      <div className="glass-card mt-6 p-6">
        <h2 className="text-lg font-semibold">Table of contents</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <TocLink href="#definitions">Definitions</TocLink>
          </li>
          <li>
            <TocLink href="#risk">Important risk disclosures</TocLink>
          </li>
          <li>
            <TocLink href="#terms">Terms of Service</TocLink>
          </li>
          <li>
            <TocLink href="#privacy">Privacy Policy</TocLink>
          </li>
          <li>
            <TocLink href="#cookies">Cookies and tracking</TocLink>
          </li>
          <li>
            <TocLink href="#security">Security</TocLink>
          </li>
          <li>
            <TocLink href="#rights">Your rights and choices</TocLink>
          </li>
          <li>
            <TocLink href="#contact">Contact</TocLink>
          </li>
        </ol>
      </div>

      <div className="prose prose-zinc mt-8 max-w-none dark:prose-invert">
        <h2 id="definitions">Definitions</h2>
        <ul>
          <li>
            <strong>Company</strong>, <strong>we</strong>, <strong>us</strong>, or <strong>our</strong> refers to the
            operator of this website and the SEC Form 4 Analyzer platform ("InsidrsAI").
          </li>
          <li>
            <strong>Services</strong> means our websites, apps, APIs, dashboards, and related tools, including any
            content, alerts, and recommendations presented through them.
          </li>
          <li>
            <strong>User</strong>, <strong>you</strong>, or <strong>your</strong> means any person or entity accessing
            the Services.
          </li>
          <li>
            <strong>Content</strong> means text, graphics, data, filings, analytics, AI-generated summaries, ratings,
            and any other information displayed by the Services.
          </li>
          <li>
            <strong>SEC filings</strong> means publicly available filings from the U.S. Securities and Exchange
            Commission (including Form 4).
          </li>
        </ul>

        <h2 id="risk">Important risk disclosures</h2>
        <p>
          <strong>No investment advice.</strong> The Services are provided for informational and educational purposes
          only. Nothing on the Services constitutes financial, investment, legal, tax, or accounting advice. You are
          solely responsible for your decisions.
        </p>
        <p>
          <strong>AI and scoring limitations.</strong> Some Content (including ratings, summaries, and explanations) may
          be generated or assisted by artificial intelligence. AI can be inaccurate, incomplete, outdated, or misleading.
          Always verify information directly from authoritative sources (for example, the original SEC filings) before
          acting.
        </p>
        <p>
          <strong>Market risk.</strong> Trading securities involves substantial risk and you can lose some or all of your
          investment. Past performance (including insider buying/selling) does not guarantee future results.
        </p>
        <p>
          <strong>No guarantee of completeness or timeliness.</strong> While we aim to ingest and process SEC filings
          promptly, delays and outages can occur. We do not guarantee that filings, alerts, or analytics will be complete,
          accurate, or available at any time.
        </p>
        <p>
          <strong>Not affiliated with the SEC.</strong> We are not endorsed by, affiliated with, or sponsored by the U.S.
          Securities and Exchange Commission.
        </p>
        <p>
          <strong>Compliance with law.</strong> You are responsible for complying with all applicable laws and regulations
          (including securities laws). The Services do not encourage or facilitate illegal activity. We provide analysis
          of public filings; we do not provide inside information.
        </p>

        <h2 id="terms">Terms of Service</h2>
        <h3>1. Eligibility and account registration</h3>
        <p>
          You must provide accurate registration information and keep it updated. You are responsible for maintaining the
          confidentiality of your credentials and for all activity under your account.
        </p>

        <h3>2. Subscriptions, billing, and cancellations</h3>
        <ul>
          <li>
            Some features require a paid subscription. Subscription details, pricing, and availability may change.
          </li>
          <li>
            Payments may be processed by third-party providers (for example, Stripe). We do not store full payment card
            details on our servers.
          </li>
          <li>
            Unless otherwise stated, subscriptions renew automatically until canceled. You can manage billing through the
            billing portal available in your account.
          </li>
          <li>
            We may suspend or terminate access for non-payment, chargebacks, or suspected fraud.
          </li>
        </ul>

        <h3>3. Acceptable use</h3>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Services in violation of any law or regulation.</li>
          <li>Attempt to reverse engineer, scrape, or abuse the Services beyond normal use.</li>
          <li>Interfere with or disrupt the integrity or performance of the Services.</li>
          <li>Share, resell, or redistribute access to the Services unless explicitly permitted.</li>
          <li>Upload malware or attempt to gain unauthorized access to accounts, systems, or networks.</li>
        </ul>

        <h3>4. Intellectual property</h3>
        <p>
          The Services, including the design, branding, and proprietary software, are owned by us or our licensors.
          Public-domain and publicly available government filings remain the property of their respective owners.
        </p>

        <h3>5. Third-party services and links</h3>
        <p>
          The Services may include links to third-party websites or services. We are not responsible for third-party
          content, policies, or practices.
        </p>

        <h3>6. Disclaimers</h3>
        <p>
          THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED,
          INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
        </p>

        <h3>7. Limitation of liability</h3>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING
          OUT OF OR RELATED TO YOUR USE OF THE SERVICES.
        </p>

        <h3>8. Indemnification</h3>
        <p>
          You agree to indemnify and hold us harmless from any claims, liabilities, damages, losses, and expenses
          (including reasonable attorneys’ fees) arising from your use of the Services or violation of these Terms.
        </p>

        <h3>9. Termination</h3>
        <p>
          We may suspend or terminate your account if you violate these Terms or if we reasonably believe your activity
          presents a risk to the Services, other users, or third parties.
        </p>

        <h3>10. Changes to the Services or Terms</h3>
        <p>
          We may update the Services and these Terms from time to time. Material changes will be communicated by updating
          the “Last updated” date and, where appropriate, by additional notice. Continued use of the Services after
          changes become effective constitutes acceptance.
        </p>

        <h3>11. Governing law</h3>
        <p>
          These Terms are governed by applicable laws in the jurisdiction where the Company is established, without
          regard to conflict-of-law principles.
        </p>

        <h2 id="privacy">Privacy Policy</h2>
        <h3>1. Information we collect</h3>
        <ul>
          <li>
            <strong>Account information</strong> (e.g., email/username, password hash, and account role).
          </li>
          <li>
            <strong>Profile information</strong> you provide (e.g., name, contact email, phone number, sector
            preferences, and recommendation settings).
          </li>
          <li>
            <strong>Usage information</strong> (e.g., pages viewed, features used, and diagnostic logs).
          </li>
          <li>
            <strong>Support and feedback</strong> (messages you send to us, including attachments if applicable).
          </li>
          <li>
            <strong>Billing information</strong> handled by payment processors; we may store billing identifiers (like
            customer or subscription IDs) but not full payment card numbers.
          </li>
        </ul>

        <h3>2. How we use information</h3>
        <ul>
          <li>Provide and improve the Services (including personalization and recommendations).</li>
          <li>Process payments, manage subscriptions, and prevent fraud.</li>
          <li>Provide customer support and respond to requests.</li>
          <li>Maintain security, debug issues, and monitor service integrity.</li>
          <li>Comply with legal obligations.</li>
        </ul>

        <h3>3. How we share information</h3>
        <p>We may share information with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> (e.g., hosting, database, email, payment processors) who process data on
            our behalf.
          </li>
          <li>
            <strong>Legal and safety</strong> recipients when required to comply with law or protect rights and safety.
          </li>
          <li>
            <strong>Business transfers</strong> in connection with a merger, acquisition, financing, or sale of assets.
          </li>
        </ul>
        <p>We do not sell personal information in the ordinary course of business.</p>

        <h3>4. Data retention</h3>
        <p>
          We retain personal information for as long as necessary to provide the Services, meet legal obligations,
          resolve disputes, and enforce agreements. Retention periods vary by data type and context.
        </p>

        <h3>5. International transfers</h3>
        <p>
          If you access the Services from outside the United States, your information may be processed in the United
          States or other jurisdictions where our providers operate.
        </p>

        <h3>6. Children’s privacy</h3>
        <p>
          The Services are not intended for children under 13 (or the minimum age required by applicable law). If you
          believe a child has provided personal information, contact us so we can take appropriate action.
        </p>

        <h2 id="cookies">Cookies and tracking</h2>
        <p>
          We use cookies or similar technologies for essential functionality (like session management), security, and to
          remember preferences. Depending on your configuration and usage, we may also use limited analytics to
          understand service performance.
        </p>

        <h2 id="security">Security</h2>
        <p>
          We implement reasonable administrative, technical, and organizational measures designed to protect personal
          information. However, no system is 100% secure, and we cannot guarantee absolute security.
        </p>

        <h2 id="rights">Your rights and choices</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, or export your personal
          information. You may also be able to object to or restrict certain processing.
        </p>
        <p>
          To make a request, contact us using the information below. We may need to verify your identity before
          fulfilling a request.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          For support or legal requests, contact us at <strong>support@insidrs.ai</strong>.
        </p>
      </div>

      <div className="mt-8 glass-card p-6">
        <div className="text-sm">
          <div className="font-semibold">Plain-English summary (non-binding)</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm muted">
            <li>This product is informational — not investment advice.</li>
            <li>AI ratings can be wrong; verify against original SEC filings.</li>
            <li>We store your account and preference settings to operate the service.</li>
            <li>Legal changes may require you to re-accept updated terms.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
