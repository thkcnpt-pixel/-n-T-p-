# PROJECT RULES

1. **Bản quyền & Chữ ký dự án**:
   - Mọi file mã nguồn (`.js`, `.css`, `.html`, `service-worker.js`) và tài liệu cấu hình đều thuộc dự án **Ứng dụng PWA Ôn Tập Đa Môn — Dev by Thkc**. Luôn giữ nguyên header comment và dòng chữ `Dev by Thkc`.

2. **Quy tắc Schema JSON câu hỏi (`part` 1, 2, 3)**:
   - **Phần 1 — Trắc nghiệm 4 lựa chọn (`part: 1`, `type: "mcq"`)**:
     - `options`: Mảng 2–4 phần tử `{ "text": "...", "shuffle": true }`. Nếu phương án có dạng *"Cả A và B đều đúng"*, *"Tất cả đều sai"* thì đặt `"shuffle": false`.
     - `answer`: Số nguyên chỉ vị trí đáp án đúng tính từ `0` (`0` = A, `1` = B, `2` = C, `3` = D).
   - **Phần 2 — Trắc nghiệm Đúng / Sai 4 mệnh đề (`part: 2`, `type: "truefalse"`)**:
     - Gom cả 4 mệnh đề `a)`, `b)`, `c)`, `d)` vào **1 câu hỏi duy nhất** (ví dụ `id`: `"cau_01"`), phần `question` chỉ chứa dẫn nhập/giả thiết chung, kèm mảng `statements` gồm 4 phần tử:
       `statements: [{ "id": "a", "text": "...", "answer": true/false }, { "id": "b", ... }, { "id": "c", ... }, { "id": "d", ... }]`.
     - **Thang điểm chuẩn Bộ GD&ĐT**: Đúng 1 ý = `0.1đ`, Đúng 2 ý = `0.25đ`, Đúng 3 ý = `0.5đ`, Đúng cả 4 ý = `1.0đ`.
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
Đã thiết lập cấu trúc phân cấp **3 tầng (Chuyên đề → Chương → Bài)** cho nhánh **Tổng hợp** và **2 tầng (Chuyên đề → Bài)** cho nhánh **Xác suất**, đồng thời **gom gọn 532 ý Đúng/Sai rời rạc thành 133 câu Đúng/Sai 4 mệnh đề (`a, b, c, d`)**, đồng bộ hoàn tất lên cả Google Drive và GitHub repo (**tổng 1.845 câu hỏi sau khi gom**):

- **Chuyên đề 1: Tổng hợp (`tonghop`)** — **ĐÃ HOÀN THÀNH ĐẦY ĐỦ 6 CHƯƠNG (Chương 1 → Chương 6: 47 bài / 1.558 câu hỏi sau khi gom 133 câu Đúng/Sai 4 ý / 566 ảnh minh họa)**:
  - **Chương 1: Ứng dụng đạo hàm để khảo sát hàm số (`chuong_1`)** — **8 bài / 180 ảnh minh họa**:
    - Drive JSON folder: `https://drive.google.com/drive/folders/1osB1IUCWnK47Ju3eeZGS3L7pnx-XTuAe` (`Wed ôn tập/toan/de-ngoai/tong-hop/chuong-1`)
    - Drive Images folder: `https://drive.google.com/drive/folders/1oXKM3i_VCu0wVAPJGIvWlVjwNU7NB98c`
    - GitHub Images dir: `assets/images/toan/ngoai/tong-hop/chuong-1/bai_01..bai_08/`
    - Chi tiết 8 bài đã xong 100%:
      1. `bai_01.json` — Bài 01: Mô hình hàm số bậc nhất và hàm bậc hai *(88 câu gốc → 73 câu sau gom, 25 ảnh)*
      2. `bai_02.json` — Bài 02: Mô hình hàm số bậc ba *(86 câu gốc → 68 câu sau gom, 30 ảnh)*
      3. `bai_03.json` — Bài 03: Mô hình hàm phân thức *(56 câu gốc → 44 câu sau gom, 16 ảnh)*
      4. `bai_04.json` — Bài 04: Mô hình hàm số lượng giác *(46 câu gốc → 37 câu sau gom, 28 ảnh)*
      5. `bai_05.json` — Bài 05: Mô hình hàm số mũ và logarit *(49 câu gốc → 40 câu sau gom, 10 ảnh)*
      6. `bai_06.json` — Bài 06: Mô hình đường tròn - elip - hypebol - parabol *(29 câu, 26 ảnh)*
      7. `bai_07.json` — Bài 07: Ý nghĩa cơ học của đạo hàm *(79 câu gốc → 67 câu sau gom, 29 ảnh)*
      8. `bai_08.json` — Bài 08: Một số dạng toán tổng hợp *(26 câu gốc → 20 câu sau gom, 16 ảnh)*
  - **Chương 2: Nguyên hàm – Tích phân và ứng dụng (`chuong_2`)** — **10 bài / 185 ảnh minh họa**:
    - Drive JSON folder: `https://drive.google.com/drive/folders/1XmzDWEcDwUKUssFyw-kSih5jXMVo0pZg` (`Wed ôn tập/toan/de-ngoai/tong-hop/chuong-2`)
    - Drive Images folder: `https://drive.google.com/drive/folders/1i-SRGp0YwmYr5YHRJc4_aiYwXBqWZGs7`
    - GitHub Images dir: `assets/images/toan/ngoai/tong-hop/chuong-2/bai_01..bai_10/`
    - Chi tiết 10 bài đã xong 100%:
      1. `bai_01.json` — Bài 01: Ứng dụng tích phân trong thực tế - Phần 1 *(55 câu gốc → 40 câu sau gom, 9 ảnh)*
      2. `bai_02.json` — Bài 02: Ứng dụng tích phân trong thực tế - Phần 2 *(53 câu gốc → 38 câu sau gom, 6 ảnh)*
      3. `bai_03.json` — Bài 03: Mô hình tích phân trong bài toán chuyển động *(60 câu gốc → 45 câu sau gom, 23 ảnh)*
      4. `bai_04.json` — Bài 04: Mô hình vi phân trong thực tế *(34 câu gốc → 31 câu sau gom, 10 ảnh)*
      5. `bai_05.json` — Bài 05: Diện tích hình thang cong - Phần 1 *(35 câu, 31 ảnh)*
      6. `bai_06.json` — Bài 06: Diện tích hình thang cong - Phần 2 *(36 câu, 30 ảnh)*
      7. `bai_07.json` — Bài 07: Thể tích của khối tròn xoay - Phần 1 *(39 câu, 24 ảnh)*
      8. `bai_08.json` — Bài 08: Thể tích của khối tròn xoay - Phần 2 *(33 câu, 29 ảnh)*
      9. `bai_09.json` — Bài 09: Thể tích của một vật thể *(23 câu, 18 ảnh)*
      10. `bai_10.json` — Bài 10: Một số dạng tích phân khác *(45 câu gốc → 30 câu sau gom, 5 ảnh)*
  - **Chương 3: Tổ hợp – Xác suất (`chuong_3`)** — **8 bài / 50 ảnh minh họa**:
    - Drive JSON folder: `https://drive.google.com/drive/folders/1tbAU45yX0cgRWMwWwZlby-enD4Zsjs_l` (`Wed ôn tập/toan/de-ngoai/tong-hop/chuong-3`)
    - Drive Images folder: `https://drive.google.com/drive/folders/16rbNq7aTrp7xkpivcus_msJGXMDNCRFn`
    - GitHub Images dir: `assets/images/toan/ngoai/tong-hop/chuong-3/bai_01..bai_08/`
    - Chi tiết 8 bài đã xong 100%:
      1. `bai_01.json` — Bài 01: Bài toán đếm tư duy - Phần 1 *(34 câu, 13 ảnh)*
      2. `bai_02.json` — Bài 02: Bài toán đếm tư duy - Phần 2 *(31 câu, 5 ảnh)*
      3. `bai_03.json` — Bài 03: Xác suất trong bài toán đếm *(61 câu gốc → 49 câu sau gom, 9 ảnh)*
      4. `bai_04.json` — Bài 04: Xác suất trò chơi *(22 câu, 11 ảnh)*
      5. `bai_05.json` — Bài 05: Phép cộng và phép nhân xác suất *(24 câu, 6 ảnh)*
      6. `bai_06.json` — Bài 06: Bài toán chia kẹo Euler và công thức Bernoulli *(38 câu gốc → 32 câu sau gom, 1 ảnh)*
      7. `bai_07.json` — Bài 07: Xác suất có điều kiện và công thức Bayes - Phần 1 *(63 câu gốc → 48 câu sau gom, 2 ảnh)*
      8. `bai_08.json` — Bài 08: Xác suất có điều kiện và công thức Bayes - Phần 2 *(62 câu gốc → 47 câu sau gom, 3 ảnh)*
  - **Chương 4: Hệ phương trình, lý thuyết đồ thị, dãy số và tài chính (`chuong_4`)** — **5 bài / 176 câu hỏi / 41 ảnh minh họa**:
    - Drive JSON folder: `https://drive.google.com/drive/folders/1DKF5riBkmMx12yNGv2mhJO7M8av9Lawh` (`Wed ôn tập/toan/de-ngoai/tong-hop/chuong-4`)
    - Drive Images folder: `https://drive.google.com/drive/folders/1U8RGAp5BTUpstQiyOuBoRKjK5mETw44C`
    - GitHub Images dir: `assets/images/toan/ngoai/tong-hop/chuong-4/bai_02..bai_04/`
    - Chi tiết 5 bài đã xong 100%:
      1. `bai_01.json` — Bài 01: Quy hoạch tuyến tính *(31 câu, 0 ảnh)*
      2. `bai_02.json` — Bài 02: Ứng dụng hệ phương trình, hệ bất phương trình *(31 câu, 4 ảnh)*
      3. `bai_03.json` — Bài 03: Ứng dụng của lý thuyết đồ thị *(26 câu, 21 ảnh)*
      4. `bai_04.json` — Bài 04: Dãy số - Cấp số cộng - Cấp số nhân và giới hạn *(54 câu, 16 ảnh)*
      5. `bai_05.json` — Bài 05: Ứng dụng toán học trong tài chính *(34 câu, 0 ảnh)*
  - **Chương 5: Phương pháp tọa độ trong không gian (`chuong_5`)** — **10 bài / 58 ảnh minh họa**:
    - Drive JSON folder: `https://drive.google.com/drive/folders/1sjzTI-jo6GP9fKD1njO0vTTE1T-8YU4H` (`Wed ôn tập/toan/de-ngoai/tong-hop/chuong-5`)
    - Drive Images folder: `https://drive.google.com/drive/folders/1F3ecrYeVWK85335v_iGNheRCMTELN_PA`
    - GitHub Images dir: `assets/images/toan/ngoai/tong-hop/chuong-5/bai_02|bai_03|bai_07|bai_10/`
    - Chi tiết 10 bài đã xong 100%:
      1. `bai_01.json` — Bài 01: Một số bài toán vectơ thường gặp *(18 câu, 0 ảnh)*
      2. `bai_02.json` — Bài 02: Mô hình vectơ trong không gian *(57 câu gốc → 48 câu sau gom, 21 ảnh)*
      3. `bai_03.json` — Bài 03: Mô hình vectơ trong không gian có yếu tố cực trị *(19 câu, 7 ảnh)*
      4. `bai_04.json` — Bài 04: Viết phương trình mặt cầu *(20 câu, 0 ảnh)*
      5. `bai_05.json` — Bài 05: Viết phương trình mặt phẳng *(24 câu, 0 ảnh)*
      6. `bai_06.json` — Bài 06: Viết phương trình đường thẳng *(33 câu gốc → 24 câu sau gom, 0 ảnh)*
      7. `bai_07.json` — Bài 07: Mô hình đường thẳng – mặt phẳng – mặt cầu trong hệ Oxyz *(63 câu gốc → 48 câu sau gom, 22 ảnh)*
      8. `bai_08.json` — Bài 08: Bài toán cực trị Oxyz – Phần 1 *(42 câu gốc → 33 câu sau gom, 0 ảnh)*
      9. `bai_09.json` — Bài 09: Bài toán cực trị Oxyz – Phần 2 *(44 câu gốc → 32 câu sau gom, 0 ảnh)*
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
Đã nạp và phân loại theo từng trường THPT (**41 trường / 49 đề thi / 1.456 câu hỏi sau khi gom 1.120 ý Đúng/Sai rời rạc thành 280 câu Đúng/Sai 4 mệnh đề `a, b, c, d` / 16 ảnh minh họa**) từ Drive (`https://drive.google.com/drive/folders/1fsIdOAAvOT-kZH0bTZU5OAG9wn_IR7gI`) lên web (`data/tinhoc-ngoai.json` & `assets/images/tinhoc/ngoai/`):
1. `chuyen-pho-thong-nang-khieu` (`de_01.json`, `de_02.json`) — **Chuyên Phổ thông Năng khiếu (Đề 01 & Đề 02)** *(56 câu sau gom, 1 ảnh)*
2. `cum-5-truong-thpt-ninh-binh/de_01.json` — **Cụm 5 trường THPT – Ninh Bình** *(29 câu sau gom, 0 ảnh)*
3. `cum-7-truong-phia-dong-hai-phong` (`de_01.json`, `de_02.json`) — **Cụm 7 trường phía Đông – Hải Phòng (Đề 01 & Đề 02)** *(60 câu sau gom, 3 ảnh)*
4. `cum-chuyen-mon-so-10-dak-lak` (`de_01.json`, `de_02.json`) — **Cụm chuyên môn số 10 – Đắk Lắk (Đề 01 & Đề 02)** *(60 câu sau gom, 0 ảnh)*
5. `cum-chuyen-mon-so-2-dak-lak/de_01.json` — **Cụm chuyên môn số 2 – Đắk Lắk** *(30 câu sau gom, 0 ảnh)*
6. `cum-chuyen-mon-so-3-dak-lak/de_01.json` — **Cụm chuyên môn số 3 – Đắk Lắk** *(30 câu sau gom, 0 ảnh)*
7. `cum-chuyen-mon-so-8-dak-lak/de_01.json` — **Cụm chuyên môn số 8 – Đắk Lắk** *(30 câu sau gom, 0 ảnh)*
8. `cum-ha-tinh-nghe-an/de_01.json` — **Cụm trường THPT Hà Tĩnh – Nghệ An** *(30 câu sau gom, 0 ảnh)*
9. `cum-truong-bac-lao-cai/de_01.json` — **Cụm trường Bắc Lào Cai** *(30 câu sau gom, 0 ảnh)*
10. `cum-truong-thpt-so-8-ha-noi/de_01.json` — **Cụm trường THPT số 8 – Hà Nội** *(30 câu sau gom, 0 ảnh)*
11. `lien-truong-thpt/de_01.json` — **Liên trường THPT** *(30 câu sau gom, 0 ảnh)*
12. `lien-truong-thpt-ha-noi/de_01.json` — **Liên trường THPT – Hà Nội** *(28 câu sau gom, 0 ảnh)*
13. `thpt-b-nguyen-khuyen/de_01.json` — **THPT B Nguyễn Khuyến** *(30 câu sau gom, 0 ảnh)*
14. `thpt-binh-khanh/de_01.json` — **THPT Bình Khánh** *(30 câu sau gom, 0 ảnh)*
15. `thpt-chu-van-an-gia-nghia/de_01.json` — **THPT Chu Văn An – Gia Nghĩa** *(30 câu sau gom, 1 ảnh)*
16. `thpt-chuyen-hung-vuong` (`de_01.json`, `de_02.json`) — **THPT Chuyên Hùng Vương (Đề 01 & Đề 02)** *(60 câu sau gom, 0 ảnh)*
17. `thpt-chuyen-le-khiet/de_01.json` — **THPT Chuyên Lê Khiết** *(30 câu sau gom, 0 ảnh)*
18. `thpt-chuyen-le-quy-don/de_01.json` — **THPT Chuyên Lê Quý Đôn** *(30 câu sau gom, 1 ảnh)*
19. `thpt-chuyen-luong-van-chanh` (`de_01.json`, `de_02.json`) — **THPT Chuyên Lương Văn Chánh – Phú Yên (Đề 01 & Đề 02)** *(60 câu sau gom, 2 ảnh)*
20. `thpt-chuyen-quang-trung/de_01.json` — **THPT Chuyên Quang Trung** *(30 câu sau gom, 0 ảnh)*
21. `thpt-hoang-van-thu/de_01.json` — **THPT Hoàng Văn Thụ** *(30 câu sau gom, 1 ảnh)*
22. `thpt-le-thanh-tong` (`de_01.json`, `de_02.json`) — **THPT Lê Thánh Tông (Đề 01 & Đề 02)** *(61 câu sau gom, 2 ảnh)*
23. `thpt-le-thuy/de_01.json` — **THPT Lệ Thủy** *(30 câu sau gom, 0 ảnh)*
24. `thpt-ly-son/de_01.json` — **THPT Lý Sơn – Quảng Ngãi** *(30 câu sau gom, 0 ảnh)*
25. `thpt-ly-tu-trong/de_01.json` — **THPT Lý Tự Trọng** *(30 câu sau gom, 0 ảnh)*
26. `thpt-marie-curie/de_01.json` — **THPT Marie Curie** *(28 câu sau gom, 0 ảnh)*
27. `thpt-nguyen-binh-khiem/de_01.json` — **THPT Nguyễn Bỉnh Khiêm** *(30 câu sau gom, 0 ảnh)*
28. `thpt-nguyen-quang-thieu/de_01.json` — **THPT Nguyễn Quang Thiệu** *(28 câu sau gom, 2 ảnh)*
29. `thpt-nguyen-van-cu/de_01.json` — **THPT Nguyễn Văn Cừ** *(30 câu sau gom, 0 ảnh)*
30. `thpt-nguyen-van-troi/de_01.json` — **THPT Nguyễn Văn Trỗi** *(30 câu sau gom, 0 ảnh)*
31. `thpt-pham-van-sang` (`de_01.json`, `de_02.json`) — **THPT Phạm Văn Sáng (Đề 01 & Đề 02)** *(60 câu sau gom, 1 ảnh)*
32. `thpt-phan-boi-chau/de_01.json` — **THPT Phan Bội Châu – Phú Yên** *(30 câu sau gom, 2 ảnh)*
33. `thpt-phuc-loi/de_01.json` — **THPT Phúc Lợi** *(30 câu sau gom, 0 ảnh)*
34. `thpt-tam-phuoc/de_01.json` — **THPT Tam Phước** *(30 câu sau gom, 0 ảnh)*
35. `thpt-thanh-my-tay/de_01.json` — **THPT Thạnh Mỹ Tây – An Giang** *(30 câu sau gom, 0 ảnh)*
36. `thpt-tran-hung-dao` (`de_01.json`, `de_02.json`) — **THPT Trần Hưng Đạo (Đề 01 & Đề 02)** *(58 câu sau gom, 0 ảnh)*
37. `thpt-tran-van-quan/de_01.json` — **THPT Trần Văn Quan – Vũng Tàu** *(30 câu sau gom, 0 ảnh)*
38. `thpt-trung-van/de_01.json` — **THPT Trung Văn** *(30 câu sau gom, 0 ảnh)*
39. `thpt-van-quan/de_01.json` — **THPT Văn Quán – Vĩnh Phúc** *(30 câu sau gom, 0 ảnh)*
40. `thpt-vo-thi-sau/de_01.json` — **THPT Võ Thị Sáu** *(28 câu sau gom, 0 ảnh)*
41. `truong-ptdtnt-thpt-binh-phuoc/de_01.json` — **Trường PTDTNT THPT Bình Phước** *(30 câu sau gom, 0 ảnh)*

---

# PENDING TASKS (NƠI DỪNG LẠI)

1. **Đồng bộ từ Google Drive lên Web App (GitHub Repo)**:
   - Toàn bộ **6 chương của Toán Đề ngoài — Tổng hợp (`Chương 1` → `Chương 6`: 47 bài / 1.558 câu sau gom / 566 ảnh)**, **Xác suất (`Bài 01` → `Bài 06`: 287 câu)** và **41 trường (49 đề thi / 1.456 câu sau gom / 16 ảnh) của Tin học Đề ngoài** **ĐÃ ĐƯỢC ĐỒNG BỘ 100% LÊN WEB** (`CACHE_VERSION = 'thkc-quiz-v2.4.0'`).
   - Toàn bộ câu hỏi Đúng/Sai trên hệ thống (413 cụm câu hỏi chính thức + 6 câu mẫu) đã được gom thành câu 4 mệnh đề (`a, b, c, d`) và áp dụng thang điểm `0.1 / 0.25 / 0.5 / 1.0`.
   - Lưu ý: Trên Drive tại `Wed ôn tập/toan/de-ngoai/xac-suat` hiện có thêm các thư mục `bai-07` đến `bai-17` (chờ lệnh xác nhận của người dùng nếu muốn nạp tiếp vào chuyên đề Xác suất).

---

# PATHS

### 1. Google Drive ("Wed ôn tập")
- **Thư mục gốc dự án (`Wed ôn tập`)**: `https://drive.google.com/drive/folders/1gUp_g_VJU38zcrOuLQeCRA0942Fb4D6v` (Folder ID: `1gUp_g_VJU38zcrOuLQeCRA0942Fb4D6v`)
  - **File tracker bàn giao trên Drive**: `AI_HANDOFF_TRACKER.md` (File ID: `1rDB8hjaS1AUbZbsFrz0gPd9zSaJCyEY5`)
  - **File hướng dẫn chuẩn**: `README.txt` (File ID: `1hMBfEc6cyiYu7ZtsdJrUVVTpU0q2f_Pp`)
  - **Toán (`toan`)**: Folder ID `17kyKcPR0H3V3gJprzy0hplzd3_1rxG1b`
    - `toan/de-ngoai/tong-hop/chuong-1`: Folder ID `1osB1IUCWnK47Ju3eeZGS3L7pnx-XTuAe`
    - `toan/de-ngoai/tong-hop/chuong-2`: Folder ID `1XmzDWEcDwUKUssFyw-kSih5jXMVo0pZg`
    - `toan/de-ngoai/tong-hop/chuong-3`: Folder ID `1tbAU45yX0cgRWMwWwZlby-enD4Zsjs_l`
    - `toan/de-ngoai/tong-hop/chuong-4`: Folder ID `1DKF5riBkmMx12yNGv2mhJO7M8av9Lawh`
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
