CREATE TABLE IF NOT EXISTS plot_private.plot_chain_commands (
 namespace text NOT NULL, broadcaster text NOT NULL, prediction text NOT NULL, operation text NOT NULL,
 decision text NOT NULL, signature text, submitted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(namespace,broadcaster,prediction,operation)
);
REVOKE ALL ON plot_private.plot_chain_commands FROM PUBLIC;
