import { Link } from "react-router-dom";

export function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl py-8 sm:py-12">
      {/* Back button */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-purple-600 dark:text-zinc-400 dark:hover:text-purple-300"
      >
        <span aria-hidden className="text-base leading-none">
          ←
        </span>
        Back to home
      </Link>

      {/* Header */}
      <div className="mt-8">
        <h1 className="text-4xl font-semibold tracking-tight">Privacy &amp; Terms</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Last updated: March 3, 2026</p>
      </div>

      {/* Content container */}
      <div className="mt-10 rounded-2xl border border-zinc-200/70 bg-white/70 p-6 backdrop-blur-sm shadow-sm dark:border-zinc-800/60 dark:bg-black/30 sm:p-8">
        <div className="space-y-10">
          {/* Privacy Policy */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Privacy Policy</h2>

            <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Information We Collect</h3>
                <p className="mt-1">
                  We collect information you provide when creating an account, including your email address and usage
                  data. We use this information to provide and improve our services.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">How We Use Your Information</h3>
                <p className="mt-1">
                  Your information is used to operate InsidrsAI, send you updates about insider trading activity, and
                  improve our analysis features. We never sell your personal information to third parties.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Data Security</h3>
                <p className="mt-1">
                  We implement industry-standard security measures to protect your data. All data transmission is
                  encrypted, and we regularly review our security practices.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Cookies</h3>
                <p className="mt-1">
                  We use cookies to maintain your session and remember your preferences. You can disable cookies in your
                  browser settings, though this may affect functionality.
                </p>
              </div>
            </div>
          </section>

          <div className="h-px bg-zinc-200/70 dark:bg-zinc-800/60" />

          {/* Terms of Service */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Terms of Service</h2>

            <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Service Description</h3>
                <p className="mt-1">
                  InsidrsAI provides analysis and tracking of publicly filed insider trading information. All data is
                  sourced from SEC filings and public records.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Not Financial Advice</h3>
                <p className="mt-1">
                  InsidrsAI is an informational tool only. Nothing on this platform constitutes financial advice,
                  investment recommendations, or solicitation to buy or sell securities. Always consult with a qualified
                  financial advisor before making investment decisions.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Account Responsibilities</h3>
                <p className="mt-1">
                  You are responsible for maintaining the confidentiality of your account credentials and for all
                  activities under your account. Notify us immediately of any unauthorized access.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Acceptable Use</h3>
                <p className="mt-1">
                  You agree not to misuse our services, including attempting to access unauthorized areas, interfering
                  with the platform&apos;s operation, or using automated systems to scrape data.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Service Availability</h3>
                <p className="mt-1">
                  We strive to maintain high availability but do not guarantee uninterrupted access. We may modify or
                  discontinue features with notice when possible.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Limitation of Liability</h3>
                <p className="mt-1">
                  InsidrsAI is provided &quot;as is&quot; without warranties. We are not liable for any losses or damages arising
                  from your use of the platform or reliance on the information provided.
                </p>
              </div>
            </div>
          </section>

          <div className="h-px bg-zinc-200/70 dark:bg-zinc-800/60" />

          {/* Contact */}
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Questions about our privacy practices or terms? Contact us at{" "}
            <a href="mailto:legal@insidrsai.com" className="link">
              legal@insidrsai.com
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
