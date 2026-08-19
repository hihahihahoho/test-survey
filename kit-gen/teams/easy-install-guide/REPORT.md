# Report — hướng dẫn cài đặt KitGen

## Đầu ra

- `huong-dan-cai-dat.xlsx`: 1 sheet `Cài đặt KitGen`, 3 cột A:C, 20 hàng.
- `huong-dan-cai-dat.tsv`: cùng nội dung dạng phẳng, 3 cột, UTF-8 có BOM.

## Bố cục

- Hàng 1: `A1:C1` merge, tiêu đề `HƯỚNG DẪN CÀI ĐẶT KITGEN`.
- Hàng 2: header `Bước | macOS | Windows`.
- Hàng 3–9: đúng 7 bước cài đặt.
- Hàng 7: `B7:C7` merge cho trạng thái hoàn tất.
- Hàng 10: `B10:C10` merge cho ghi chú xoá dữ liệu.
- Hàng 11: `A11:C11` merge cho link bản gộp cũ.
- Hàng 12: `A12:C12` merge, tiêu đề sự cố `GẶP VẤN ĐỀ → XỬ LÝ`.
- Hàng 13: `B13:C13` merge cho header cách xử lý.
- Hàng 14–20: 7 hàng sự cố; mỗi hàng `B:C` merge.
- Header có nền màu/chữ đậm; bảng có viền mỏng; wrap text; freeze tại `A3`.
- Độ rộng cột: A = 22, B = 52, C = 52.
- Link tải macOS/Windows và link bản gộp là hyperlink bấm được.

## Nghiệm thu mở lại file

Thư viện: `openpyxl 3.1.5`. `@oai/artifact-tool` không có trong môi trường; không cài thêm thư viện.

Kết quả đọc lại bằng `openpyxl`:

```text
sheetnames: ['Cài đặt KitGen']
dimensions: 20 3
freeze_panes: A3
gridlines: False
merges: ['A11:C11', 'A12:C12', 'A1:C1', 'B10:C10', 'B13:C13', 'B14:C14', 'B15:C15', 'B16:C16', 'B17:C17', 'B18:C18', 'B19:C19', 'B20:C20', 'B7:C7']
top3:
['HƯỚNG DẪN CÀI ĐẶT KITGEN', None, None]
['Bước', 'macOS', 'Windows']
['1. Tải bộ cài', 'Tải kitgen-easy-install-macos.zip', 'Tải kitgen-easy-install-windows.zip']
hyperlinks: [('B3', 'Tải kitgen-easy-install-macos.zip', 'https://github.com/hihahihahoho/test-survey/releases/latest/download/kitgen-easy-install-macos.zip'), ('C3', 'Tải kitgen-easy-install-windows.zip', 'https://github.com/hihahihahoho/test-survey/releases/latest/download/kitgen-easy-install-windows.zip'), ('A11', 'Nếu link báo Not Found (bản cũ): tải bản gộp https://github.com/hihahihahoho/test-survey/releases/latest/download/kitgen-easy-install.zip', 'https://github.com/hihahihahoho/test-survey/releases/latest/download/kitgen-easy-install.zip')]
widths: [22.0, 52.0, 52.0]
title_style: Arial 16.0 True
header_style: 005B9BD5 True
wrap_sample: True True
warning_rich_text: True [('Giải nén ra Desktop rồi mới chạy (', False), ('ĐỪNG bấm đúp trong cửa sổ xem .zip', True), (')', False)]
zip_test: OK
tsv_bom: True
tsv_lines: 20
tsv_columns_all_3: True
```

Kiểm tra OOXML bằng `unzip -t`: `No errors detected in compressed data`.

