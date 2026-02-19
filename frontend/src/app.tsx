import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAdmin, RequireAuth, RequireSubscription } from "@/components/route-guards";

import { RootLayout } from "@/pages/root-layout";
import { HomePage } from "@/pages/home";
import { PricingPage } from "@/pages/pricing";
import { PrivacyPage } from "@/pages/privacy";
import { TermsPage } from "@/pages/terms";
import { LoginPage } from "@/pages/login";
import { SignupPage } from "@/pages/signup";

import { AppShell } from "@/pages/app/app-shell";
import { AccountPage } from "@/pages/app/account";
import { AdminJobsPage } from "@/pages/app/admin-jobs";
import { AdminMonitoringPage } from "@/pages/app/admin-monitoring";
import { EventsPage } from "@/pages/app/events";
import { EventDetailPage } from "@/pages/app/event-detail";
import { FeedbackPage } from "@/pages/app/feedback";
import { TickersPage } from "@/pages/app/tickers";
import { TickerDetailPage } from "@/pages/app/ticker-detail";

function NotFound() {
  return (
    <div className="py-20 text-center">
      <div className="text-2xl font-semibold">404</div>
      <div className="mt-2 text-sm text-black/60 dark:text-white/60">Page not found.</div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<HomePage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />

        <Route
          path="app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="tickers" replace />} />
          <Route path="account" element={<AccountPage />} />

          {/* Subscription-gated routes */}
          <Route element={<RequireSubscription />}>
            <Route path="tickers" element={<TickersPage />} />
            <Route path="ticker/:ticker" element={<TickerDetailPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="event/:issuer_cik/:owner_key/:accession_number" element={<EventDetailPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
          </Route>

          {/* Admin routes */}
          <Route element={<RequireAdmin />}>
            <Route path="admin/monitoring" element={<AdminMonitoringPage />} />
            <Route path="admin/jobs" element={<AdminJobsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
