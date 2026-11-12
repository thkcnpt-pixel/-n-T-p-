# PROJECT RULES

1. **Bản quyền & Chữ ký dự án**:
   - Mọi file mã nguồn (`.js`, `.css`, `.html`, `service-worker.js`) và tài liệu cấu hình đều thuộc dự án **Ứng dụng PWA Ôn Tập Đa Môn — Dev by Thkc**. Luôn giữ nguyên header comment và dòng chữ `Dev by Thkc`.

2. **Quy tắc Schema JSON câu hỏi (`part` 1, 2, 3)**:
   - **Phần 1 — Trắc nghiệm 4 lựa chọn (`part: 1`, `type: "mcq"`)**:
     - `options`: Mảng 2–4 phần tử `{ "text": "...", "shuffle": true }`. Nếu phương án có dạng *"Cả A và B đều đúng"*, *"Tất cả đều sai"* thì đặt `"shuffle": false`.
     - `answer`: Số nguyên chỉ vị trí đáp án đúng tính từ `0` (`0` = A, `1` = B, `2` = C, `3` = D).
   - **Phần 2 — Trắc nghiệm Đúng / Sai (`part: 2`, `type: "truefalse"`)**:
     - Tách mỗi ý `a)`, `b)`, `c)`, `d)` của 1 câu lớn thành 4 câu độc lập (ví dụ `id`: `"cau_01a"`, `"cau_01b"`, `"cau_01c"`, `"cau_01d"`), mỗi câu lặp lại giả thiết chung kèm mệnh đề cần xét để khi xáo trộn câu hỏi vẫn đầy đủ ngữ cảnh.
     - `answer`: Boolean `true` (Đúng) hoặc `false` (Sai). Không cần truyền `options`.
   - **Phần 3 — Trắc nghiệm Trả lời ngắn (`part: 3`, `type: "short"`)**:
     - `answer`: Mảng chuỗi đáp án hợp lệ (chấp nhận cả dấu phẩy và dấu chấm thập phân, ví dụ `["1,5", "1.5"]`). Không để mảng rỗng.

3. **Quy tắc Công thức KaTeX & Escape chuỗi JSON**:
   - Chỉ dùng `$ ... $` (inline math) và `$$ ... $$` (block math). Tuyệt đối không dùng `\(...\)` hay `\[...\]`.
   - Trong file JSON, mọi dấu gạch chéo ngược `\` của LaTeX **BẮT BUỘC nhân đôi thành `\\`** (ví dụ: `"$\\frac{x+1}{x-1}$"`, `"$\\sqrt{2}$"`, `"$\\overrightarrow{AB}$"`), tránh lỗi ký tự điều khiển `\f`, `\t`, `\b`, `\n`.

4. **Quy tắc Xuống dòng, Code & Chống XSS**:
   - Web render nội dung bằng `textContent` kết hợp KaTeX nên **tuyệt đối không dùng thẻ HTML** (`<br>`, `<b>`, `<sub>`, `<sup>`) trong `question`, `options[].text`, `explanation`.
   - Mọi đoạn xuống dòng hoặc đoạn code/giả mã/SQL/HTML/Python trong câu hỏi phải dùng ký tự xuống dòng `\n`.

5. **Quy tắc Hình ảnh & Cache PWA**:
   - Hình minh họa lưu dạng `.png` đặt tại `assets/images/...` trong repo GitHub, khớp chính xác với đường dẫn tương đối trong trường `"image"` của câu hỏi (nếu không có ảnh thì `"image": null`).
   - Mỗi lần cập nhật dữ liệu JSON hoặc tài nguyên tĩnh trên web, **BẮT BUỘC tăng `CACHE_VERSION`** trong `service-worker.js` để thiết bị người dùng tự động làm mới bộ nhớ đệm PWA.

---

# COMPLETED TASKS

### 1. Môn Toán — Đề ngoài (`data/toan-ngoai.json`)
Đã thiết lập cấu trúc phân cấp **3 tầng (Chuyên đề → Chương → Bài)** cho nhánh **Tổng hợp** và **2 tầng (Chuyên đề → Bài)** cho nhánh **Xác suất**, đồng bộ hoàn tất lên cả Google Drive và GitHub repo:

- **Chuyên đề 1: Tổng hợp (`tonghop`)**
  - **Chương 5: Phương pháp tọa độ trong không gian (`chuong_5`)** — **10 bài / 333 câu hỏi / 58 ảnh minh họa**:
    - Drive JSON folder: `https://drive.google.com/drive/folders/1sjzTI-jo6GP9fKD1njO0vTTE1T-8YU4H` (`Wed ôn tập/toan/de-ngoai/tong-hop/chuong-5`)
    - Drive Images folder: `https://drive.google.com/drive/folders/1F3ecrYeVWK85335v_iGNheRCMTELN_PA`
    - GitHub Images dir: `assets/images/toan/ngoai/tong-hop/chuong-5/bai_02|bai_03|bai_07|bai_10/`
    - Chi tiết 10 bài đã xong 100%:
      1. `bai_01.json` — Bài 01: Một số bài toán vectơ thường gặp *(18 câu, 0 ảnh)*
      2. `bai_02.json` — Bài 02: Mô hình vectơ trong không gian *(57 câu, 21 ảnh)*
      3. `bai_03.json` — Bài 03: Mô hình vectơ trong không gian có yếu tố cực trị *(19 câu, 7 ảnh)*
      4. `bai_04.json` — Bài 04: Viết phương trình mặt cầu *(20 câu, 0 ảnh)*
      5. `bai_05.json` — Bài 05: Viết phương trình mặt phẳng *(24 câu, 0 ảnh)*
      6. `bai_06.json` — Bài 06: Viết phương trình đường thẳng *(33 câu, 0 ảnh)*
      7. `bai_07.json` — Bài 07: Mô hình đường thẳng – mặt phẳng – mặt cầu trong hệ Oxyz *(63 câu, 22 ảnh)*
      8. `bai_08.json` — Bài 08: Bài toán cực trị Oxyz – Phần 1 *(42 câu, 0 ảnh)*
      9. `bai_09.json` — Bài 09: Bài toán cực trị Oxyz – Phần 2 *(44 câu, 0 ảnh)*
      10. `bai_10.json` — Bài 10: Mô hình Oxyz có yếu tố cực trị *(13 câu, 8 ảnh)*
  - **Chương 6: Góc, khoảng cách và thể tích không gian (`chuong_6`)** — **6 bài / 241 câu hỏi / 52 ảnh minh họa**:
    - Drive JSON folder: `https://drive.google.com/drive/folders/1i2zU7ctCvMto3DU2bCzgM_IBkXUSdHYj` (`Wed ôn tập/toan/de-ngoai/tong-hop/chuong-6`)
    - Drive Images folder: `https://drive.google.com/drive/folders/13-xtUjNZm_KpFIANQE2xtUTFbG18OVW-`
    - GitHub Images dir: `assets/images/toan/ngoai/tong-hop/chuong-6/bai_01..bai_06/`
    - Chi tiết 6 bài đã xong 100%:
      1. `bai_01.json` — Bài 01: Góc giữa đường thẳng và mặt phẳng *(39 câu, 8 ảnh)*
      2. `bai_02.json` — Bài 02: Góc nhị diện và góc giữa hai mặt phẳng *(33 câu, 5 ảnh)*
      3. `bai_03.json` — Bài 03: Khoảng cách từ điểm đến mặt phẳng *(41 câu, 5 ảnh)*
      4. `bai_04.json` — Bài 04: Khoảng cách giữa hai đường thẳng chéo nhau *(42 câu, 9 ảnh)*
      5. `bai_05.json` — Bài 05: Thể tích khối đa diện *(44 câu, 10 ảnh)*
      6. `bai_06.json` — Bài 06: Các bài toán liên quan đến khối nón – khối cầu – khối trụ *(42 câu, 15 ảnh)*

- **Chuyên đề 2: Xác suất (`xacsuat`)** — **6 bài / 287 câu hỏi / 9 ảnh minh họa**:
  - Drive JSON folder: `Wed ôn tập/toan/de-ngoai/xac-suat`
  - GitHub Images dir: `assets/images/toan/ngoai/xac-suat/bai_01..bai_06/`
  - Chi tiết 6 bài đã xong 100%:
    1. `bai_01.json` — Bài 01: Các quy tắc đếm cơ bản *(48 câu)*
    2. `bai_02.json` — Bài 02: Xác suất và các quy tắc tính xác suất *(42 câu)*
    3. `bai_03.json` — Bài 03: Bài toán xếp chỗ phần 1 *(58 câu)*
    4. `bai_04.json` — Bài 04: Bài toán xếp chỗ phần 2 *(59 câu)*
    5. `bai_05.json` — Bài 05: Hoán vị vòng tròn *(24 câu)*
    6. `bai_06.json` — Bài 06: Bài toán chia kẹo Euler *(56 câu)*

---

### 2. Môn Tin học — Đề ngoài (`data/tinhoc-ngoai.json`)
Đã nạp và phân loại theo từng trường THPT (**10 trường / 480 câu hỏi / 4 ảnh minh họa**) từ Drive (`https://drive.google.com/drive/folders/1fsIdOAAvOT-kZH0bTZU5OAG9wn_IR7gI`) lên web (`data/tinhoc-ngoai.json` & `assets/images/tinhoc/ngoai/`):
1. `cum-chuyen-mon-so-3-dak-lak/de_01.json` — **Cụm chuyên môn số 3 – Đắk Lắk** *(48 câu, 0 ảnh)* — Drive folder: `1F4tMPKgp0RymSO01TB3Gcm3cXs5J6DAF`
2. `thpt-binh-khanh/de_01.json` — **THPT Bình Khánh** *(48 câu, 0 ảnh)* — Drive folder: `1PWvD-zJLMkm5D8jhmkNmhLttyk_IT-nB`
3. `thpt-chuyen-hung-vuong/de_01.json` — **THPT Chuyên Hùng Vương** *(48 câu, 0 ảnh)* — Drive folder: `1Q4s2q2vCqpI-3K9GP_0yfcQ-jtv722hi`
4. `thpt-chuyen-luong-van-chanh/de_01.json` — **THPT Chuyên Lương Văn Chánh – Phú Yên** *(48 câu, 2 ảnh: `cau_23.png`, `cau_24.png`)* — Drive folder: `1fvop4v9aFCmbjH1kOigiKLvy3u7cBGBC`
5. `thpt-ly-son/de_01.json` — **THPT Lý Sơn – Quảng Ngãi** *(48 câu, 0 ảnh)* — Drive folder: `1yJm6JoqcrSF0n0mz3GGDsH4dxInoyUG2`
6. `thpt-phan-boi-chau/de_01.json` — **THPT Phan Bội Châu – Phú Yên** *(48 câu, 2 ảnh: `cau_11.png`, `cau_22.png`)* — Drive folder: `13ozwW3uIEdIhHw5jv6o25ICEoGDFzH61`
7. `thpt-tam-phuoc/de_01.json` — **THPT Tam Phước** *(48 câu, 0 ảnh)* — Drive folder: `14AvJAxsLGjg-DbqDCLe0XAaKj-aPGs7z`
8. `thpt-thanh-my-tay/de_01.json` — **THPT Thạnh Mỹ Tây – An Giang** *(48 câu, 0 ảnh)* — Drive folder: `1YCQ6uj4IIYP4AQi6_cnJR0hYTzMnllTW`
9. `thpt-tran-van-quan/de_01.json` — **THPT Trần Văn Quan – Vũng Tàu** *(48 câu, 0 ảnh)* — Drive folder: `1VUoH1k6KvfVWffsqqVSv40deeX8trkkA`
10. `thpt-van-quan/de_01.json` — **THPT Văn Quán – Vĩnh Phúc** *(48 câu, 0 ảnh)* — Drive folder: `16EsXdPmUHlo5TAYGCVr31MLACTD1v4Um`

---

# PENDING TASKS (NƠI DỪNG LẠI)

1. **Đồng bộ từ Google Drive lên Web App (GitHub Repo)**:
   - Toàn bộ dữ liệu JSON và hình ảnh đã có trên Google Drive tính đến thời điểm hiện tại (**Toán Đề ngoài Chương 5, Chương 6, Xác suất** và **10 trường Tin học Đề ngoài**) **ĐÃ ĐƯỢC ĐỒNG BỘ 100% LÊN WEB** (`CACHE_VERSION = 'thkc-quiz-v1.8.0'`). Không còn câu hỏi nào đang nạp dở dang giữa Drive và Web.

2. **Các đề gốc (Word/PDF) còn lại trên Google Drive chờ bóc tách sang JSON (nếu tiếp tục bóc tách đề)**:
   - **Môn Tin học — Đề ngoài** (Thư mục file gốc `tin học` trên Drive — ID: `1nsSzoxfAO9pff-iDJA-R_krlpnRbsAfg` hiện có 15 file gốc, đã xong 10 trường ở mục Completed, còn **5 trường chưa có thư mục JSON trong `Wed ôn tập/tinhoc/de-ngoai/`**, bắt đầu từ **Câu 1** của từng đề):
     1. `CỤM KIẾN AN - DƯƠNG KÍNH - KIẾN THỤY - HẢI PHÒNG.pdf` (File ID: `1hxqbxO9yhg-giBaeDiqIeZ5YPfFVl0kr`) — cần bóc từ **Câu 1**.
     2. `THPT CHUYÊN TRẦN ĐẠI NGHĨA - HCM - ĐA.docx` (File ID: `1EcfrN0m0TLP7Gs_QrwAJ_-hUML8YCdaj`) — cần bóc từ **Câu 1**.
     3. `THPT DIỄN CHÂU 5 - NGHỆ AN - ĐA.docx` (File ID: `1_G1JqYGCQnKmzMPM2CXHnyZm0FtTwSjb`) — cần bóc từ **Câu 1**.
     4. `THPT PHAN ĐÌNH PHÙNG - HN-ĐA.docx` (File ID: `1xdxNI9ULsgNFPoj3-IuEQwI23dm5_ldL`) — cần bóc từ **Câu 1**.
     5. `THPT Tân Sơn - Phú Thọ - Đáp án.docx` (File ID: `1w_pcXzCy2Ia6dsYSQnTVciv8VPn-KG2r`) — cần bóc từ **Câu 1**.
   - **Môn Toán — Đề ngoài — Tổng hợp (`Wed ôn tập/toan/de-ngoai/tong-hop/`)**:
     - `chuong-1` đến `chuong-4`: Hiện thư mục trên Drive đang trống, chờ bổ sung file JSON các bài học (nếu có). Khi có thêm chương mới trên Drive, chỉ cần gộp vào mảng `categories[0].chapters` trong `data/toan-ngoai.json` và `DEFAULT_TOAN_NGOAI_CATEGORIES` trong `js/services/data.service.js` (UI Accordion 3 tầng sẽ tự động hiển thị các chương có bài học).

---

# PATHS

### 1. Google Drive ("Wed ôn tập")
- **Thư mục gốc dự án (`Wed ôn tập`)**: `https://drive.google.com/drive/folders/1gUp_g_VJU38zcrOuLQeCRA0942Fb4D6v` (Folder ID: `1gUp_g_VJU38zcrOuLQeCRA0942Fb4D6v`)
  - **File hướng dẫn chuẩn**: `README.txt` (File ID: `1hMBfEc6cyiYu7ZtsdJrUVVTpU0q2f_Pp`)
  - **Toán (`toan`)**: Folder ID `17kyKcPR0H3V3gJprzy0hplzd3_1rxG1b`
    - `toan/de-ngoai/tong-hop/chuong-5`: Folder ID `1sjzTI-jo6GP9fKD1njO0vTTE1T-8YU4H`
    - `toan/de-ngoai/tong-hop/chuong-6`: Folder ID `1i2zU7ctCvMto3DU2bCzgM_IBkXUSdHYj`
  - **Tin học (`tinhoc`)**: Folder ID `1f4rOPslr84ITpvEH9oA9z2Ak0xsZAs6O`
    - `tinhoc/de-ngoai`: Folder ID `1fsIdOAAvOT-kZH0bTZU5OAG9wn_IR7gI`
  - **Thư mục chứa file Word/PDF gốc môn Tin học (`tin học`)**: Folder ID `1nsSzoxfAO9pff-iDJA-R_krlpnRbsAfg`

### 2. GitHub Repository & Local Workspace
- **GitHub Repository**: `https://github.com/thkcnpt-pixel/-n-T-p-` (branch: `main`)
- **Local Workspace trên máy ảo**: `/home/antigravity/thkcnpt-pixel/-n-T-p-`
  - File tracker bàn giao: `/home/antigravity/thkcnpt-pixel/-n-T-p-/AI_HANDOFF_TRACKER.md`
  - Dữ liệu Toán Đề ngoài: `/home/antigravity/thkcnpt-pixel/-n-T-p-/data/toan-ngoai.json`
  - Dữ liệu Tin học Đề ngoài: `/home/antigravity/thkcnpt-pixel/-n-T-p-/data/tinhoc-ngoai.json`
  - Ảnh Toán Đề ngoài: `/home/antigravity/thkcnpt-pixel/-n-T-p-/assets/images/toan/ngoai/`
  - Ảnh Tin học Đề ngoài: `/home/antigravity/thkcnpt-pixel/-n-T-p-/assets/images/tinhoc/ngoai/`
  - Logic nạp dữ liệu & danh mục: `/home/antigravity/thkcnpt-pixel/-n-T-p-/js/services/data.service.js`
  - Logic giao diện Wizard & Accordion: `/home/antigravity/thkcnpt-pixel/-n-T-p-/js/app.js`
  - Quản lý Cache PWA: `/home/antigravity/thkcnpt-pixel/-n-T-p-/service-worker.js`
