import { createDoc, listDocs, loadCanvas, patchDoc, purgeDocs, restoreDoc, saveCanvas, trashDoc } from "../lib/docs.mjs"
export function register(r){
  r.get("/api/projects/:id/docs", async c=>({status:200,json:{items:await listDocs(c.registry.active,c.params.id,{includeTrashed:c.url.searchParams.get("includeTrashed")==="1"}),defaultDocId:null}}))
  r.post("/api/projects/:id/docs", async c=>({status:201,json:{doc:await createDoc(c.registry.active,c.params.id,await c.json())}}))
  r.patch("/api/projects/:id/docs/:docId", async c=>({status:200,json:{doc:await patchDoc(c.registry.active,c.params.id,c.params.docId,await c.json())}}))
  r.delete("/api/projects/:id/docs/:docId", async c=>({status:200,json:{ok:true,...await trashDoc(c.registry.active,c.params.id,c.params.docId)}}))
  r.post("/api/projects/:id/docs/:docId/restore", async c=>({status:200,json:{doc:await restoreDoc(c.registry.active,c.params.id,c.params.docId)}}))
  r.post("/api/projects/:id/docs/purge", async c=>({status:200,json:{purged:await purgeDocs(c.registry.active,c.params.id)}}))
  r.get("/api/projects/:id/docs/:docId/canvas", async c=>{const x=await loadCanvas(c.registry.active,c.params.id,c.params.docId);return {status:200,json:x,headers:{ETag:`\"${x.version}\"`}}})
  r.put("/api/projects/:id/docs/:docId/canvas", async c=>{const b=await c.json();const x=await saveCanvas(c.registry.active,c.params.id,c.params.docId,b.canvas,c.req.headers["if-match"]);return {status:200,json:x,headers:{ETag:`\"${x.version}\"`}}})
}
