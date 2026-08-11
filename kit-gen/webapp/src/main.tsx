import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

/**
 * Điểm vào duy nhất. Mọi thứ khác nằm trong App.tsx để test có thể dựng app
 * mà không cần DOM thật.
 */
const rootEl = document.getElementById("root");
if (!rootEl) {
  // Không thể xảy ra với index.html của repo; nhưng nếu ai đó nhúng bundle vào
  // trang khác thì báo cho ra hồn, đừng để `null!` ném lỗi khó hiểu.
  throw new Error('Không tìm thấy <div id="root"> — kiểm tra lại index.html.');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
