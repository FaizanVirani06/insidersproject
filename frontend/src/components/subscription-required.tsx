import { Link } from "react-router-dom";

export function SubscriptionRequired() {
  return (
    <div className="mx-auto max-w-3xl py-20">
      <div className="glass-card p-8">
        <div className="text-xl font-semibold">Subscription required</div>
        <div className="mt-2 text-sm muted">Your account is not subscribed. Subscribe to unlock the insiders dashboard.</div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/pricing" className="btn-primary">
            View pricing
          </Link>
          <Link to="/app/account" className="btn-secondary">
            Account
          </Link>
        </div>
      </div>
    </div>
  );
}
