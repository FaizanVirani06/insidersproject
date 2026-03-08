export function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Legal</h1>
        <p className="mt-2 text-sm muted">
          This page combines our Privacy Policy and Terms of Service. Replace these placeholders with
          your finalized legal language before launch.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Privacy Policy</h2>
        <p className="text-sm muted">
          We collect the minimum data needed to operate the product.
        </p>
        <ul className="list-disc pl-5 text-sm muted space-y-2">
          <li>We store account credentials securely (hashed passwords).</li>
          <li>We store billing identifiers (Stripe customer/subscription IDs) to manage access.</li>
          <li>We store support chats and feedback you submit to improve the product.</li>
          <li>We do not sell personal information.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Terms of Service</h2>
        <p className="text-sm muted">Using this product means you agree to the following:</p>
        <ul className="list-disc pl-5 text-sm muted space-y-2">
          <li>Informational purposes only; not investment advice.</li>
          <li>No warranty on data completeness or correctness.</li>
          <li>Accounts can be suspended/terminated for abuse or fraud.</li>
          <li>Subscription billing is handled by Stripe; cancel anytime.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Risk disclosure</h2>
        <p className="text-sm muted">
          Trading involves risk, including loss of principal. Any trade plans shown are educational
          examples derived from technicals and do not guarantee outcomes.
        </p>
      </section>
    </div>
  );
}
