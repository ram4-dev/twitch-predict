CREATE TABLE IF NOT EXISTS plot_private.plot_payment_orders (
 namespace text NOT NULL, id text NOT NULL, provider text NOT NULL, environment text NOT NULL CHECK (environment='test'),
 wallet text NOT NULL, amount numeric(20,0) NOT NULL CHECK (amount>0 AND amount<=18446744073709551615),
 receipt_key text NOT NULL, status text NOT NULL CHECK (status IN ('pending','verified','submitted','finalized')),
 signature text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(namespace,id), UNIQUE(namespace,provider,environment,id), UNIQUE(namespace,receipt_key)
);
REVOKE ALL ON plot_private.plot_payment_orders FROM PUBLIC;
CREATE TABLE IF NOT EXISTS plot_private.plot_mock_payments (
 namespace text NOT NULL, id text NOT NULL, wallet text NOT NULL, amount numeric(20,0) NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','paid')), PRIMARY KEY(namespace,id)
);
REVOKE ALL ON plot_private.plot_mock_payments FROM PUBLIC;
CREATE TABLE IF NOT EXISTS plot_private.plot_twitch_markets (
 namespace text NOT NULL, broadcaster text NOT NULL, prediction text NOT NULL, wallet text NOT NULL,
 outcomes jsonb NOT NULL, closes_at timestamptz NOT NULL, timeout_at timestamptz NOT NULL,
 phase text NOT NULL DEFAULT 'open', winner text, source text, PRIMARY KEY(namespace,broadcaster,prediction)
);
CREATE TABLE IF NOT EXISTS plot_private.plot_twitch_events (
 namespace text NOT NULL, event_id text NOT NULL, fingerprint text NOT NULL,
 PRIMARY KEY(namespace,event_id)
);
REVOKE ALL ON plot_private.plot_twitch_markets,plot_private.plot_twitch_events FROM PUBLIC;
