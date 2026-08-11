/**
 * Barrel của TẦNG FILE CON (sub-file). Cố ý KHÔNG re-export `catalog.ts`/`anchors.ts`
 * (trang trợ giúp mã lỗi) — hai nhóm khác nhiệm vụ, gộp lại sẽ kéo 571 dòng nội dung
 * trợ giúp vào mọi bundle có canvas.
 */
export * from "./types";
export * from "./docs-errors";
export * from "./docs-repo";
export * from "./invariants";
export * from "./brief-read";
export * from "./draft-badge";
export { localDocsRepo, TRASH_KEEP_DAYS } from "./docs-repo-local";
export {
  configureDocsIdb,
  docsIdbAvailable,
  DOCS_IDB_NAME,
  DOCS_IDB_VERSION,
  DOCS_STORE,
  docKey,
} from "./docs-idb";
