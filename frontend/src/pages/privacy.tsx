export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl py-12 space-y-4">
      <h1 className="text-2xl font-semibold">Privacy</h1>
      <p className="text-sm text-black/70 dark:text-white/70">
        This is a placeholder Privacy Policy. Replace with your policy before launch.
      </p>
      <ul className="list-disc pl-5 text-sm text-black/70 dark:text-white/70 space-y-2">
        <li>We store account credentials securely (hashed passwords).</li>
        <li>We store billing identifiers (Stripe customer/subscription IDs).</li>
        <li>We store feedback you submit to improve the product.</li>
      </ul>
    </div>
  );
}
