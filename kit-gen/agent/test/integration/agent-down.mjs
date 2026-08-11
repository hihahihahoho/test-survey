/* Luồng AGENT CHƯA CHẠY: mọi request phải THẤT BẠI CÓ THỜI HẠN, không treo. */

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const agent=await import(ROOT+"/web/js/core/agent.js")
const errors=await import(ROOT+"/web/js/core/errors.js")

// fetch giả: KHÔNG bao giờ trả lời (mô phỏng cổng có ai đó nghe nhưng không đáp / mạng treo)
let aborted=0
agent.configure({
  fetchImpl: (url,opts)=>new Promise((_,rej)=>{
    opts?.signal?.addEventListener?.("abort",()=>{aborted++;const e=new Error("aborted");e.name="AbortError";rej(e)})
  }),
  location:{protocol:"https:",hostname:"kitgen.pages.dev",pathname:"/",origin:"https://kitgen.pages.dev"},
  baseUrl:"http://127.0.0.1:8765",
})
let pass=0,fail=0
const ck=(n,c,d="")=>{c?(pass++,console.log(`  ✓ ${n}`)):(fail++,console.log(`  ✗ ${n} ${d}`))}

// AbortSignal.timeout của Node là timer UNREF ⇒ tự nó không giữ event loop sống.
// Giữ loop bằng một interval ref để đo được, không phải để "chữa" lỗi.
const keepAlive=setInterval(()=>{},50)
const t0=Date.now()
let err=null
try { await agent.health() } catch(e){ err=e }
const dt=Date.now()-t0
console.log(`health() khi agent im lặng: ${dt}ms · lỗi = ${err?.code ?? err?.name}`)
ck("health() KHÔNG treo (bỏ cuộc ≤3s theo TIMEOUT.health 1200ms)", dt<3000, `${dt}ms`)
ck("có mã lỗi để tra bảng §3.9", !!err && typeof err.code==="string", String(err?.code))
const view=errors.present(err)
console.log(`  UI hiện: "${view.title}" — ${view.explain}`)
ck("bảng §3.9 cho chữ tiếng Việt, KHÔNG lộ message kỹ thuật", !!view.title && !JSON.stringify(view).includes("aborted"))

const t1=Date.now()
let err2=null
try { await agent.get("/api/projects") } catch(e){ err2=e }
const dt2=Date.now()-t1
console.log(`GET /api/projects: ${dt2}ms · lỗi = ${err2?.code}`)
ck("GET có timeout 8s + retry 1 lần, tổng vẫn hữu hạn (≤20s)", dt2<20000, `${dt2}ms`)
ck(`AbortController thật sự cắt request (đã abort ${aborted} lần)`, aborted>=2)
clearInterval(keepAlive)
console.log(`\n${pass} pass · ${fail} FAIL`)
process.exit(fail?1:0)
