import { defineRailway, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-west2" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });
  const backupsVolume = volume("backups-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-west2", sizeMB: 5000 });
  Postgres.volumeMounts = { "/var/lib/postgresql/data": postgresVolume };
  const api = service("api", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10, sleepApplication: false },
    replicas: { "us-west2": 1 },
  });
  const worker = service("worker", {
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10, sleepApplication: false },
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    replicas: { "us-west2": 1 },
  });
  const backups = service("backups", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.backup" },
    replicas: { "us-west2": 1 },
    deploy: { cronSchedule: "0 6 * * *", restartPolicyType: "NEVER" },
    volumeMounts: { "/backups": backupsVolume },
  });

  return project("plot", {
    variables: { managed: false },
    resources: [Postgres, api, worker, backups, postgresVolume, backupsVolume],
  });
});
