/** Điểm vào duy nhất của client state. Component import từ đây, không import file con. */
export * from "./persist";
export * from "./secrets";
export * from "./ui";
export * from "./recent";
export * from "./editor";
/* Nguồn sự thật của tuỳ chọn nằm trên ĐĨA, không nằm ở localStorage. `disk-settings` là
   phần THUẦN (danh sách field + so sánh) nên vào được cửa chung.

   `./settings-sync` CỐ Ý KHÔNG có ở đây, dù nó là cặp bài trùng: nó kéo theo TanStack
   Query và cả `api/endpoints`, mà `@/lib/store` thì được import từ hàng chục component
   chỉ để lấy `useUiStore`. Cho nó vào cửa chung là bắt mọi màn (và mọi test render) nạp
   thêm tầng API. Nó có ĐÚNG MỘT nơi gọi — `App.tsx` — nên nơi đó import thẳng file. */
export * from "./disk-settings";
