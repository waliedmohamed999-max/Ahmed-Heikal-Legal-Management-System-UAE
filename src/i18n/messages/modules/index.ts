import hearings from "./hearings";
import cases from "./cases";
import clients from "./clients";
import events from "./events";
import documents from "./documents";
import ai from "./ai";
import admin from "./admin";
import platform from "./platform";
import finance from "./finance";

// Register module dictionaries here. Each module keeps `en` and `ar` side by side (ar: typeof en).
export const MODULES: { en: object; ar: object }[] = [hearings, cases, clients, events, documents, ai, admin, platform, finance];
