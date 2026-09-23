import { config } from "dotenv";

// Secrets from .env; DATABASE_URL / STORAGE_LOCAL_DIR are already overridden by the test config.
config({ quiet: true });
