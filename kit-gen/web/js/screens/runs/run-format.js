/**
 * runs/run-format.js — chuỗi hiển thị của S4 (nhãn trạng thái, chẩn đoán, đồng hồ).
 * Tách khỏi run-detail.js để mỗi file dưới ~400 dòng.
 * Mọi copy tiếng Việt bám §5.7 (7 trạng thái) và §3-S4-4 (1 dòng chẩn đoán cho lượt lỗi).
 */

import { fmtBytes, fmtClock, fmtDuration } from './run-store.js';

export function mapJobState(status) {
  const s = String(status ?? 'queued');
  return ['never', 'queued', 'running', 'ok', 'stale', 'uncut', 'failed'].includes(s) ? s : 'queued';
}

const DIAGNOSIS = {
  QUOTA_SUSPECTED: 'nghi hết quota tài khoản',
  NOT_LOGGED_IN: 'chưa đăng nhập được công cụ tạo ảnh',
  NO_ARTIFACT: 'ảnh không được ghi',
  TIMEOUT: 'quá thời gian chờ',
  UNKNOWN: 'chưa rõ nguyên nhân — mở nhật ký để xem',
};

export function diagText(j) {
  if (j.diagnosis) return DIAGNOSIS[String(j.diagnosis).toUpperCase()] ?? DIAGNOSIS.UNKNOWN;
  if (j.status === 'ok') {
    const parts = ['Xong'];
    if (j.durationMs) parts.push(fmtDuration(j.durationMs));
    if (j.artifact?.bytes) parts.push(fmtBytes(j.artifact.bytes));
    return parts.join(' · ');
  }
  return null;
}

export function jobMeta(j) {
  if (j.status === 'running' && j.startedAt) return fmtClock((Date.now() - new Date(j.startedAt)) / 1000);
  if (j.status === 'queued') return 'đang chờ';
  const parts = [];
  if (j.durationMs) parts.push(fmtDuration(j.durationMs));
  if (j.artifact?.bytes) parts.push(fmtBytes(j.artifact.bytes));
  return parts.join(' · ');
}

export function elapsedText(run) {
  if (!run?.startedAt) return '';
  const end = run.finishedAt ? new Date(run.finishedAt) : new Date();
  return fmtClock((end - new Date(run.startedAt)) / 1000);
}

export function variantLabel(v) { return String(v ?? ''); }
export function kindLabel(kind) {
  return kind === 'slice' ? 'Cắt' : (kind === 'skeleton' ? 'Khung xương' : 'Sinh ảnh');
}
export function fmtMinutes(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return `${Math.round(s)} giây`;
  return `${Math.max(1, Math.round(s / 60))} phút`;
}
