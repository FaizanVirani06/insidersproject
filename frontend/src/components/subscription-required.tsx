import { Link } from "react-router-dom";

export function SubscriptionRequired() {
  return (
    <div className="mx-auto max-w-3xl py-20">
      <div className="rounded-2xl border bg-white p-8 shadow-sm dark:bg-black/20">
        <div className="text-xl font-semibold">Subscription required</div>
        <div className="mt-2 text-sm text-black/70 dark:text-white/70">
          Your account is not subscribed. Subscribe to unlock the insiders dashboard.
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/pricing"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
          >
            View pricing
          </Link>
          <Link
            to="/app/account"
            className="rounded-md border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            Account
          </Link>
        </div>
      </div>
    </div>
  );
}
