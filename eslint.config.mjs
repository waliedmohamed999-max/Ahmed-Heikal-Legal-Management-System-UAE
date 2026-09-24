import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: ["src/generated/**", "storage/**", "storage-test/**", "test-results/**", "playwright-report/**", ".next/**", "dist/**", "backups/**", "backups-test/**"] },
];

export default config;
