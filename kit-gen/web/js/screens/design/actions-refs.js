/**
 * design/actions-refs.js — thao tác ẢNH THAM KHẢO của tab Phong cách (§3-S3.5).
 * Tách khỏi actions.js để mỗi file dưới ~400 dòng.
 *
 * Upload đi qua #30 `POST /api/projects/:id/refs` MULTIPART và **agent tự đặt tên**:
 * client KHÔNG BAO GIỜ gửi `path` (bài học G1 — v1 bị `refs/../gen.sh` xuyên qua),
 * cũng không gửi base64 (đóng G5).
 */

import { toast } from '../../ui/index.js';
import { api, errors } from '../../core/index.js';
import * as opsStyle from './ops-style.js';

export function createRefActions({ state, projectId, apply, guard }) {
  /* ── ẢNH REF (multipart, agent tự đặt tên — đóng G1/A4/G5) ─────────────── */

  async function uploadRefs(variantId, kind, files) {
    if (!guard()) return;
    for (const file of files) {
      try {
        const res = await api.refs.add(projectId, file, kind === 'brand' ? 'brand' : 'inspo');
        const path = res?.path ?? `refs/${res?.name ?? ''}`;
        const v = (state.contract?.variants ?? []).find((x) => x.id === variantId);
        if (kind === 'brand') {
          const refs = [...(v?.brand?.refs ?? []), path];
          apply(opsStyle.patchVariant(state.contract, variantId, { brand: { refs } }, `Thêm ảnh brand vào «${variantId}»`));
        } else {
          const refs = [...(v?.inspo ?? []), path];
          apply(opsStyle.patchVariant(state.contract, variantId, { inspo: refs }, `Thêm ảnh tham khảo vào «${variantId}»`));
        }
        toast.success({ title: `Đã tải lên ${res?.name ?? file.name}`, description: 'Bấm Lưu để ghi vào bản thiết kế.' });
      } catch (e) {
        const view = errors.present(e);
        toast.error({ title: view.title, description: view.explain });
      }
    }
  }

  async function uploadCharacterRef(characterId, files) {
    if (!guard() || files.length === 0) return;
    try {
      const res = await api.refs.add(projectId, files[0], 'character', characterId);
      apply(opsStyle.patchCharacter(state.contract, characterId, { ref: res?.path ?? `refs/${res?.name}` },
        `Đặt ảnh tham khảo cho «${characterId}»`));
      toast.success({ title: `Đã tải lên ${res?.name ?? files[0].name}` });
    } catch (e) {
      const view = errors.present(e);
      toast.error({ title: view.title, description: view.explain });
    }
  }

  function removeRefFromVariant(variantId, kind, path) {
    if (!guard()) return;
    const v = (state.contract?.variants ?? []).find((x) => x.id === variantId);
    if (kind === 'brand') {
      const refs = (v?.brand?.refs ?? []).filter((p) => p !== path);
      apply(opsStyle.patchVariant(state.contract, variantId, { brand: { refs } }, `Bỏ ảnh brand khỏi «${variantId}»`));
    } else {
      const refs = (v?.inspo ?? []).filter((p) => p !== path);
      apply(opsStyle.patchVariant(state.contract, variantId, { inspo: refs }, `Bỏ ảnh tham khảo khỏi «${variantId}»`));
    }
  }


  return { uploadRefs, uploadCharacterRef, removeRefFromVariant };
}
