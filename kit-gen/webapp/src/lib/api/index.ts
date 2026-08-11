/** Bề mặt công khai của tầng API. Component KHÔNG import `client.ts` trực tiếp (§6.5-1). */
export { api, default as endpoints } from "./endpoints";
export {
  systemApi, projectsApi, trashApi, uploadsApi, importApi,
  contractApi, elementLibApi, refsApi, runsApi, filesApi,
} from "./endpoints";
export { AgentError, detectEntry, mirrorUrl, bridgeUrl, configureClient, currentBase, fileUrl, thumbUrl } from "./client";
export type { EntryInfo, TransportOutcome } from "./client";
export * from "./connection";
export * from "./errors";
export { LIMITS, PORT_CANDIDATES, APP_PROTOCOL, ENTRY, TIMEOUT, RETRY } from "./constants";
export { NdjsonParser, readNdjsonStream, splitLines, nextCursor } from "./ndjson";
