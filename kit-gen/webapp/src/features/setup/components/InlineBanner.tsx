/**
 * ĐÃ GỘP VỀ DÙNG CHUNG (INTEGRATION) — bản thật nằm ở `components/common/InlineBanner.tsx`.
 *
 * NEEDS-s0-setup.md §N2 đề nghị: "nếu ≥2 màn cần, nâng lên components/common; tôi xoá bản
 * của mình và đổi import". Điều kiện đã thoả (S0 5 chỗ + S5 3 chỗ) nên đã nâng. File này
 * giữ lại làm cầu re-export để 5 file của S0 không phải đổi import — KHÔNG còn logic nào.
 */
export { InlineBanner, type InlineBannerProps, type BannerTone } from "@/components/common/InlineBanner";
