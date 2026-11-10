# Ôn Tập Trắc Nghiệm Đa Môn (PWA) — Dev by Thkc

Bộ khung Web App luyện đề trắc nghiệm đa môn (**Toán học, Vật lý, Tin học**) chạy hoàn toàn bằng **Client-Side Rendering** (HTML5, CSS3, Vanilla ES Modules), tích hợp **Firebase v9 Modular** và đạt chuẩn **Progressive Web App (PWA)** hoạt động 100% khi Offline.

---

## 1. Cấu trúc thư mục

```text
-n-T-p-/
├── index.html                  # Khung SPA duy nhất (4 màn hình ẩn/hiện + Dialog + Templates)
├── manifest.json               # Cấu hình PWA (Add to Home Screen)
├── service-worker.js           # Chiến lược Cache-First cho HTML, CSS, JS, JSON, Ảnh, KaTeX
├── firestore.rules             # Firebase Security Rules (phân quyền Học sinh & Admin)
├── css/
│   ├── variables.css           # Design tokens Dark Mode (nền xám than #1e1f24, màu nhấn dịu mắt)
│   ├── base.css                # Reset, Typography, ảnh responsive, xử lý KaTeX tràn ngang
│   ├── layout.css              # Bố cục SPA, Smart Header tự ẩn khi cuộn, chế độ Từng câu
│   └── components.css          # Thẻ câu hỏi, nút đáp án, Accordion lời giải, vòng điểm, Toast
├── js/
│   ├── app.js                  # Entry point: đăng ký SW, điều phối Auth, Offline Sync & UI
│   ├── core/
│   │   ├── firebase.js         # Khởi tạo Firebase v9 Modular qua CDN gstatic
│   │   ├── router.js           # Điều hướng SPA tích hợp History API & Leave Guard
│   │   └── state.js            # Store trạng thái + đồng bộ cache cài đặt cục bộ
│   ├── services/
│   │   ├── auth.service.js     # Đăng nhập / Đăng xuất (không có Đăng ký - do Admin cấp)
│   │   ├── audit.service.js    # Lấy IP qua api.ipify.org & ghi vào collection login_logs
│   │   ├── profile.service.js  # Đồng bộ cài đặt làm bài lên users/{uid}
│   │   ├── history.service.js  # Lưu lịch sử thi & autoClean xóa bản ghi > 365 ngày
│   │   ├── offline.service.js  # Hàng đợi localStorage & tự đẩy dữ liệu khi có sự kiện online
│   │   └── data.service.js     # Tải & ghép [mon]-truong.json + [mon]-ngoai.json
│   ├── quiz/
│   │   ├── shuffle.js          # Fisher-Yates tôn trọng thuộc tính "shuffle": false
│   │   ├── grader.js           # Chấm 3 dạng câu; chấm Trả lời ngắn siêu nới lỏng
│   │   ├── renderer.js         # Dựng DOM câu hỏi, bảng số câu & gọi KaTeX auto-render
│   │   └── controller.js       # Đồng hồ, thanh tiến độ, Cuộn/Từng câu, Làm lại câu sai
│   └── ui/
│       ├── smart-header.js     # Ẩn header khi cuộn xuống, hiện lại khi cuộn lên
│       ├── swipe.js            # Vuốt trái/phải chuyển câu trên màn hình cảm ứng
│       ├── accordion.js        # Hiệu ứng trượt mượt mở lời giải
│       └── settings-modal.js   # Popup Cài đặt linh hoạt
├── data/
│   ├── subjects.json           # Danh sách môn học
│   ├── toan-truong.json        # 3 câu mẫu môn Toán (có công thức KaTeX inline & block)
│   ├── toan-ngoai.json         # []
│   ├── vatly-truong.json       # 3 câu mẫu môn Vật lý (có câu gắn "image": "images/sample.jpg")
│   ├── vatly-ngoai.json        # []
│   ├── tinhoc-truong.json      # 3 câu mẫu môn Tin học (có đáp án gắn "shuffle": false)
│   └── tinhoc-ngoai.json       # []
├── images/
│   └── sample.jpg              # Hình minh họa mẫu
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-maskable-512.png
```

---

## 2. Thiết lập Firebase Console

1. **Authentication**:
   - Vào **Firebase Console → Authentication → Sign-in method**, bật phương thức **Email/Password** (tắt *Email link* nếu không dùng).
   - Sang tab **Users → Add user** để cấp tài khoản (Email & Mật khẩu) cho học sinh và tài khoản quản trị `thkcnpt@gmail.com`.
2. **Firestore Database & Security Rules**:
   - Tạo cơ sở dữ liệu Firestore.
   - Mở tab **Rules**, dán toàn bộ nội dung file [`firestore.rules`](file:///home/antigravity/thkcnpt-pixel/-n-T-p-/firestore.rules) (hoặc khối Rules bên dưới) và bấm **Publish**:

```protobuf
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    function isAdmin() {
      return isSignedIn()
        && request.auth.token.email != null
        && request.auth.token.email == 'thkcnpt@gmail.com';
    }

    match /users/{userId} {
      allow read, write: if isOwner(userId);
      match /history/{historyId} {
        allow read, write: if isOwner(userId);
      }
    }

    match /login_logs/{logId} {
      allow read: if isAdmin();
      allow create: if isSignedIn()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasAll(['timestamp', 'userAgent', 'ip'])
        && request.resource.data.userAgent is string
        && request.resource.data.ip is string;
      allow update, delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 3. Cách chạy thử nghiệm ở máy cục bộ (Local Server)

Vì ứng dụng sử dụng ES Modules (`<script type="module">`), `fetch()` JSON và Service Worker nên cần chạy qua giao thức HTTP/HTTPS:

```bash
# Cách 1: Dùng Python 3 có sẵn
python3 -m http.server 8080

# Cách 2: Dùng Node.js (npx serve)
npx serve -l 8080 .
```

Sau đó mở trình duyệt tại địa chỉ `http://localhost:8080`.

---

## 4. Quy chuẩn thêm câu hỏi mới vào `data/*.json`

Mỗi file JSON là một mảng các đối tượng câu hỏi thuộc 1 trong 3 dạng:

- **Trắc nghiệm 4 đáp án (`"type": "mcq"`)**:
  ```json
  {
    "id": "tinhoc-1",
    "type": "mcq",
    "question": "Nội dung câu hỏi (hỗ trợ công thức $x^2$ và $$\\int f(x)dx$$)",
    "image": "images/sample.jpg",
    "options": [
      { "text": "Phương án A", "shuffle": true },
      { "text": "Phương án B", "shuffle": true },
      { "text": "Phương án C", "shuffle": true },
      { "text": "Cả A và B đều đúng", "shuffle": false }
    ],
    "answer": 3,
    "explanation": "Lời giải chi tiết hiển thị trong Accordion."
  }
  ```
- **Đúng / Sai (`"type": "truefalse"`)**: `"answer": true` hoặc `false`.
- **Trả lời ngắn / Điền khuyết (`"type": "short"`)**: `"answer": ["đáp án 1", "đáp án 2"]` (chấm điểm tự động bỏ khoảng trắng thừa, bỏ dấu câu cơ bản và không phân biệt hoa/thường).

---

*Dev by Thkc*
