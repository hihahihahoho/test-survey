import { describe, it, eq, ok } from "./harness.mjs"
export async function run({api,pid}){
  describe("canvas documents")
  let id
  await it("create/list/load canvas",async()=>{
    const c=await api("POST",`/api/projects/${pid}/docs`,{body:{name:"Bàn ý tưởng",kind:"canvas"}}); eq(c.status,201); id=c.json.doc.id
    const l=await api("GET",`/api/projects/${pid}/docs`); eq(l.json.items.length,1)
    const x=await api("GET",`/api/projects/${pid}/docs/${id}/canvas`); eq(x.status,200); eq(x.json.version,0); eq(x.json.canvas.nodes,[])
  })
  await it("If-Match protects canvas",async()=>{
    const canvas={nodes:[{id:"n1",type:"note",x:1,y:2,w:20,h:10,z:1,text:"hello",bind:null}],viewport:{x:0,y:0,k:1}}
    const no=await api("PUT",`/api/projects/${pid}/docs/${id}/canvas`,{body:{canvas}}); eq(no.status,412)
    const a=await api("PUT",`/api/projects/${pid}/docs/${id}/canvas`,{headers:{"if-match":"0"},body:{canvas}}); eq(a.status,200); eq(a.json.version,1)
    const stale=await api("PUT",`/api/projects/${pid}/docs/${id}/canvas`,{headers:{"if-match":"0"},body:{canvas}}); eq(stale.status,409); eq(stale.json.error.details.serverVersion,1)
  })
  await it("rename, soft delete and restore",async()=>{
    const p=await api("PATCH",`/api/projects/${pid}/docs/${id}`,{body:{name:"Bàn chính",color:"mint"}}); eq(p.json.doc.name,"Bàn chính")
    const d=await api("DELETE",`/api/projects/${pid}/docs/${id}`); ok(d.json.trashedAt)
    eq((await api("GET",`/api/projects/${pid}/docs`)).json.items.length,0)
    eq((await api("GET",`/api/projects/${pid}/docs?includeTrashed=1`)).json.items.length,1)
    const r=await api("POST",`/api/projects/${pid}/docs/${id}/restore`); eq(r.json.doc.trashedAt,null)
  })
}
