CREATE TABLE IF NOT EXISTS plot_private.plot_payment_orders (
 namespace text NOT NULL, id text NOT NULL, provider text NOT NULL, environment text NOT NULL CHECK (environment='test'),
 wallet text NOT NULL, amount numeric(20,0) NOT NULL CHECK (amount>0 AND amount<=18446744073709551615),
 receipt_key text NOT NULL, status text NOT NULL CHECK (status IN ('pending','verified','submitted','finalized')),
 signature text, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(namespace,id), UNIQUE(namespace,provider,environment,id), UNIQUE(namespace,receipt_key)
);
REVOKE ALL ON plot_private.plot_payment_orders FROM PUBLIC;
