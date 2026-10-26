CREATE SCHEMA IF NOT EXISTS plot_private;
  REVOKE ALL ON SCHEMA plot_private FROM PUBLIC;
  CREATE TABLE IF NOT EXISTS plot_private.documents(
   namespace text NOT NULL, name text NOT NULL, data jsonb NOT NULL,
   revision bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
   PRIMARY KEY(namespace,name)
  );
  CREATE TABLE IF NOT EXISTS plot_private.leases(
   namespace text NOT NULL, name text NOT NULL, owner text NOT NULL, expires_at timestamptz NOT NULL,
   heartbeat timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(namespace,name)
  );
  CREATE TABLE IF NOT EXISTS plot_private.request_limits(namespace text NOT NULL,name text NOT NULL,window_start timestamptz NOT NULL,requests integer NOT NULL,PRIMARY KEY(namespace,name));
  REVOKE ALL ON ALL TABLES IN SCHEMA plot_private FROM PUBLIC;
