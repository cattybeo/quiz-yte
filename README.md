# Quiz ôn tập Tổ chức & Quản lý Y tế

Static site thuần HTML/CSS/JS, không build step, không dependency.

```
index.html   entry
styles.css   giao diện (light, tông trung tính/mát)
app.js       logic: routing (#hash), timer, shuffle, localStorage, sound
data.js      102 câu / 10 bài, generate từ questionnaire_dap_an.pdf
tools/parse.py  script parse PDF -> data.js
```

## Sửa với hot reload

```bash
npm install        # lần đầu
npm run dev        # http://localhost:5173
```
- Sửa `styles.css`: CSS được inject ngay, không reload trang.
- Sửa `app.js`, `data.js`, `index.html`: tự reload trang. Tiến độ quiz nằm trong localStorage nên reload không mất bài đang làm.
- Terminal in ra địa chỉ `External` (vd. `http://192.168.x.x:5173`): mở trên iPhone/iPad cùng Wi-Fi để xem live trên máy thật.

## Deploy

GitHub Pages deploy thẳng từ branch `main` (thư mục gốc). Mỗi lần push, GitHub tự publish lại sau khoảng 1 phút:

```bash
git add -A && git commit -m "sửa câu hỏi bài 3" && git push
```
Site: https://cattybeo.github.io/quiz-yte/

GitHub Pages cache file khoảng 10 phút. Mở lại mà chưa thấy bản mới thì hard refresh (Cmd+Shift+R) hoặc chờ vài phút.

## Cập nhật câu hỏi

Sửa trực tiếp `data.js`, hoặc parse lại từ PDF:
```bash
# đặt questionnaire_dap_an.pdf ở thư mục gốc, cần pdftotext (brew install poppler)
npm run data
```
Format mỗi câu: `{ "q": "...", "options": ["...", "..."], "answer": <index 0-based> }`.
Đổi tiêu đề trang: thêm `window.QUIZ_META = { title: "...", subtitle: "..." }` vào cuối `data.js`.

## Hành vi

- Mỗi lượt: xáo trộn thứ tự câu hỏi. Bật "Xáo trộn đáp án" thì xáo luôn đáp án, trừ câu có "Cả A và B" (giữ nguyên) và "Tất cả các câu trên" (giữ ở cuối, xáo phần còn lại).
- 10 giây mỗi câu. Hết giờ tính là sai, hiện đáp án đúng.
- Đúng: tự sang câu sau sau 0,9s. Sai/hết giờ: bấm "Câu tiếp" (hoặc Enter).
- Tiến độ lưu `localStorage` (key `yteq.v1`) sau mỗi câu: reload hoặc đóng tab vẫn làm tiếp được.
- Kết quả lưu lịch sử (tối đa 300 lượt): điểm, xếp loại (Xuất sắc ≥90%, Tốt ≥75%, Đạt ≥50%, Cần ôn lại), thời gian, danh sách câu sai kèm đáp án đúng.
- Phím tắt desktop: `1–4` / `A–D` chọn, `Enter` câu tiếp, `Esc` về trang chủ.
- Âm thanh tạo bằng Web Audio API (không file asset). Trên iPhone, gạt công tắc im lặng sẽ tắt tiếng.
