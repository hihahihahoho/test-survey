import { AgentError, httpDelete, httpGet, httpPatch, httpPost, httpPut } from "@/lib/api/client";
import { canvasDocSchema, docSchema, type Doc } from "./types";
import { DocsRepoError, type DocsErrorCode } from "./docs-errors";
import type { CreateDocInput, DocsRepo } from "./docs-repo";

const enc = encodeURIComponent;
const base = (projectId: string) => `/api/projects/${enc(projectId)}/docs`;
function mapError(error: unknown): never {
  if (error instanceof DocsRepoError) throw error;
  if (error instanceof AgentError) {
    const supported = new Set<DocsErrorCode>(["DOC_NOT_FOUND","DOC_NAME_TAKEN","INVALID_NAME","DOC_CONFLICT","DOC_BROKEN","DOC_READONLY","STORAGE_FULL","STORAGE_UNAVAILABLE"]);
    const code = supported.has(error.code as DocsErrorCode) ? error.code as DocsErrorCode : "STORAGE_UNAVAILABLE";
    throw new DocsRepoError(code, error.message);
  }
  throw new DocsRepoError("STORAGE_UNAVAILABLE", String(error));
}
function parseDoc(raw: unknown): Doc {
  const parsed = docSchema.safeParse(raw);
  if (!parsed.success) throw new DocsRepoError("DOC_BROKEN", parsed.error.message);
  return parsed.data;
}
export const httpDocsRepo: DocsRepo = {
  kind: "http",
  available: async () => true,
  async list(projectId, opts) { try { const x = await httpGet<{items:unknown[]}>(`${base(projectId)}${opts?.includeTrashed ? "?includeTrashed=1" : ""}`); return x.items.map(parseDoc); } catch(e){ return mapError(e); } },
  async create(projectId, input: CreateDocInput) { try { return parseDoc((await httpPost<{doc:unknown}>(base(projectId), input)).doc); } catch(e){ return mapError(e); } },
  async rename(projectId, docId, name) { try { return parseDoc((await httpPatch<{doc:unknown}>(`${base(projectId)}/${enc(docId)}`, {name})).doc); } catch(e){ return mapError(e); } },
  async setColor(projectId, docId, color) { try { return parseDoc((await httpPatch<{doc:unknown}>(`${base(projectId)}/${enc(docId)}`, {color})).doc); } catch(e){ return mapError(e); } },
  async setView(projectId, docId, view) { try { return parseDoc((await httpPatch<{doc:unknown}>(`${base(projectId)}/${enc(docId)}`, {view})).doc); } catch(e){ return mapError(e); } },
  async duplicate(projectId, docId) { try { const source = (await httpDocsRepo.list(projectId, {includeTrashed:true})).find(d=>d.id===docId); if(!source) throw new DocsRepoError("DOC_NOT_FOUND"); return httpDocsRepo.create(projectId,{name:`${source.name} (bản sao)`.slice(0,48),kind:source.kind,fromDocId:docId}); } catch(e){ return mapError(e); } },
  async remove(projectId, docId) { try { return await httpDelete<{trashedAt:string}>(`${base(projectId)}/${enc(docId)}`); } catch(e){ return mapError(e); } },
  async restore(projectId, docId) { try { return parseDoc((await httpPost<{doc:unknown}>(`${base(projectId)}/${enc(docId)}/restore`)).doc); } catch(e){ return mapError(e); } },
  async purgeExpired(projectId) { try { return (await httpPost<{purged:number}>(`${base(projectId)}/purge`)).purged; } catch(e){ return mapError(e); } },
  async load(projectId, docId) { try { const x=await httpGet<{version:number;canvas:unknown}>(`${base(projectId)}/${enc(docId)}/canvas`); return {version:x.version,canvas:canvasDocSchema.parse(x.canvas)}; } catch(e){ return mapError(e); } },
  async save(projectId, docId, canvas, expectedVersion) { try { return await httpPut<{version:number;bytes:number}>(`${base(projectId)}/${enc(docId)}/canvas`,{canvas},{headers:{"If-Match":String(expectedVersion)}}); } catch(e){ return mapError(e); } },
};
