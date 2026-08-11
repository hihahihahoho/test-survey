/* projects-dir.mjs — tách riêng để projects.mjs ↔ contract.mjs không import vòng. */
import { join } from "node:path"
import { RE_PROJECT_ID, assertMatch, safeSegment } from "./paths.mjs"

export function projectDir(ws, id) {
  assertMatch(RE_PROJECT_ID, id, "BAD_REQUEST", "projectId")
  safeSegment(id, "projectId")
  return join(ws.projectsDir, id)
}
