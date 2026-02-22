export type User = {
  user_id: number;
  username: string;
  role: "admin" | "user";
  is_admin?: boolean;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
  current_period_end?: string | null;
  is_paid?: boolean;
};

export type TickerRow = {
  issuer_cik: string;
  current_ticker: string;
  issuer_name?: string | null;
  last_filing_date?: string | null;
  open_market_event_count?: number;
  ai_event_count?: number;
  cluster_event_count?: number;
  market_cap?: number | null;
  market_cap_bucket?: string | null;
  market_cap_updated_at?: string | null;
  sector?: string | null;
  beta?: number | null;
};

export type InsiderEventRow = Record<string, any> & {
  issuer_cik: string;
  owner_key: string;
  accession_number: string;
  ticker?: string;
  filing_date?: string;
  event_trade_date?: string | null;
  owner_name_display?: string | null;
  owner_title?: string | null;
  is_officer?: number | null;
  is_director?: number | null;
  is_ten_percent_owner?: number | null;
  has_buy?: number;
  has_sell?: number;
  buy_dollars_total?: number | null;
  sell_dollars_total?: number | null;
  ai_buy_rating?: number | null;
  ai_sell_rating?: number | null;
  ai_confidence?: number | null;
  best_ai_rating?: number | null;
  cluster_flag_buy?: number | null;
  cluster_flag_sell?: number | null;
  market_cap?: number | null;
  market_cap_bucket?: string | null;
  sector?: string | null;
  beta?: number | null;
};

export type EventDetail = {
  event: InsiderEventRow;
  rows: any[];
  outcomes: any[];
  stats: any[];
  clusters: { buy: any | null; sell: any | null };
  ai_latest: any | null;
  trade_plan?: any | null;
};

export type PricePoint = { date: string; adj_close: number };
