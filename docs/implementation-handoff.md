# Bàn giao trạng thái AP Process

## Trạng thái hiện tại (03/10/2026)

- **P01–P09 đã triển khai và được đánh dấu hoàn tất** trong [plan](./plan.md); P09 có breakdown theo loại chi phí trong response API và card kết quả. [Specs](./specs.md), [test-plan](./test-plan.md) và [README](../README.md) là tài liệu hiện hành.
- Chủ board báo đã thử qua localhost và xác nhận bố cục kết quả trông đúng, gồm `Cập nhật` ngay dưới `Tháng báo cáo` và các dòng tổng theo hạng mục. Không lưu ảnh chụp, số tiền hoặc tên hạng mục thực tế trong repo.
- **P10 vẫn chưa hoàn tất:** chủ board báo service đã lên production, nút thủ công, trigger vào Paid và cron 19:00 giờ Việt Nam hoạt động; cold start khoảng 50–60 giây. Hiện Paid-trigger đang dùng button secret; bản code tiếp theo yêu cầu `RECONCILE_PAID_TRIGGER_SECRET` riêng và owner/admin phải cập nhật host cùng Automation header sau deploy. Các bằng chứng hệ thống về deadline/alert/rollback và acceptance còn lại vẫn phải ghi trong [plan](./plan.md); không tự đánh dấu P10 hoàn tất.
- Kiểm chứng tự động gần nhất: 118 test pass, typecheck và build pass. Read-only Trello preflight và `GET /health` localhost pass; xem [plan](./plan.md) để biết bằng chứng và phần còn thiếu. P10 không được đánh dấu xong chỉ dựa vào mock hoặc ảnh chụp.
- Các tài liệu người dùng yêu cầu hiện có: nội dung thuyết trình ở [ap-process-presentation-content.md](./ap-process-presentation-content.md), hướng dẫn board ở [ap-process-board-user-guide.md](./ap-process-board-user-guide.md), và deck import Google Slides ở [ap-process-presentation.pptx](./ap-process-presentation.pptx). Chưa tạo script riêng; người dùng dự định thuyết trình dựa trên file nội dung.

## Snapshot lịch sử trước implement (29/09/2026)

Phần dưới ghi lại trạng thái bàn giao trước khi bắt đầu code, không phải trạng thái repo hiện tại.

**Giai đoạn khi đó:** Specs → Clarify → Plan → Implement (session kế tiếp). Chủ board xác nhận [plan](./plan.md) và [test-plan](./test-plan.md) đã ổn. Tại thời điểm snapshot, chưa viết API, test code, chạy thử host, sửa board hay bật cron/nút.

## Đọc theo thứ tự khi mở session mới

1. [specs.md](./specs.md) — contract kỹ thuật, business rules, trạng thái HTTP, nguồn Trello/Amazing Fields; đây là nguồn chính khi viết code.
2. [clarification.md](./clarification.md) — những quyết định đã chốt về quy trình, archived Paid, Telegram và cooldown, cùng cách giải mã pluginData.
3. [plan.md](./plan.md) — kiến trúc, rủi ro/gate, file dự kiến và **P01–P10** theo thứ tự; checkbox hiện chưa được tick.
4. [test-plan.md](./test-plan.md) — **Static (T1) → Runtime (T2) → System (T3)**, catalog lệnh/case, bảng ownership từng test và crosswalk của mọi AC. Phần lớn lệnh `pnpm` trong đây **chỉ chạy sau khi P01–P09 tạo source/tests**.
5. [specs-ke-toan.md](./specs-ke-toan.md) — diễn giải nghiệp vụ để Kế toán/Giám đốc xem lại bổ sung trước go-live. Các file `Inut AP Process.md`/`AP Process update.docx` là nguồn lịch sử, **không** ghi đè quy tắc mới trong specs/clarification. Người dùng tự xuất PDF, chỉ sửa Markdown khi cần.

## Trạng thái repo và môi trường

- Hiện chưa có `package.json`, `src/`, `tests/`, DB, ứng dụng Hono, cấu hình host hay automation triển khai. Node.js **22.23.2** và pnpm **11.5.3** có sẵn; dùng **pnpm** và `pnpm-lock.yaml`, không tạo `package-lock.json`. Bắt đầu P01, không giả định lệnh build/test đã tồn tại.
- `.env.example` có **11 tên biến**; `.env` bị `.gitignore` loại khỏi Git. **Không đọc/ghi lại/công bố giá trị `.env` trong tài liệu/log/chat; không đưa credentials, payload phiếu thật hoặc chứng từ vào fixture.** Kiểm tra env thực tế tại runtime, không giả định người dùng đã điền đủ.
- Worktree đang có thay đổi chưa commit: các spec/clarification và nhiều tài liệu đã staged; `docs/plan.md` đang staged **và** có sửa chưa staged; `docs/test-plan.md` chưa tracked; file bàn giao này mới tạo. Không reset/revert thay đổi không thuộc task, không coi trạng thái staged là đã commit.
- Board **test**: short link `DfIesTRJ`; Paid list ID `6ab1722c3ff9a38479bc155e`; card kết quả `bbElWm0C`; Amazing Fields Power-Up ID `60e068efb294647187bbe4f5`. Board/card short link dùng để truy xuất được; khi so sánh phải resolve/so object ID cùng board. IDs production **chưa được cung cấp/chọn**, lấy từ env khi chuyển môi trường. Không ghi board production trong tests.

## Contract nghiệp vụ và kỹ thuật phải giữ

- Mỗi card Paid = **một lần chi** bằng đúng một phương thức. Kế toán là người nhập `Ngày thanh toán` (ngày **và giờ thực chi**) trước khi chuyển Paid. Người tạo tự assign Draft, Requesting thêm/@mention Giám đốc, Approved thêm/@mention Kế toán; mọi move có comment audit. Đây là **quy trình con người**, Trello/Amazing Fields Free không khóa quyền hay bắt buộc field; API không auto-approve/assign/comment/move.
- Chỉ phiếu **chưa chi** vào Discard; muốn archive thì chuyển Discard và comment trước. Phiếu Paid **không** chuyển Discard, archive hoặc xóa; nếu phát hiện archived còn thuộc Paid phải dừng/báo link card để khôi phục. Không dùng nhãn `already-check`: mỗi lượt đọc/kiểm tra **tất cả Paid**, kể cả phiếu tháng cũ; Draft/Requesting/Approved/Discard không tính.
- Amazing Fields **không** phải Trello native Custom Fields. Board `CFG` từ `GET /boards/{id}/pluginData`, card `FD` từ `GET /cards/{id}/pluginData`, lọc đúng plugin, dùng `LZString.decompressFromUTF16`, parse JSON và map field/option **theo ID**. Bốn field là `Số tiền` (nguyên VND dương), `Loại chi phí` (lựa chọn hợp lệ để dashboard sau), `Hình thức thanh toán` (Tiền mặt/Chuyển khoản), `Ngày thanh toán` (timestamp thực chi). Kiểm format/version/schema/type; **không** parse tiền từ chuỗi VND trên UI hoặc suy đoán từ description/comment. Plugin format nội bộ, fail closed nếu không tương thích.
- Chốt `asOf` đầu lượt, xác định tháng ở `Asia/Ho_Chi_Minh` theo khoảng từ 00:00 ngày 1 đến trước 00:00 ngày 1 tháng sau. Kết quả chỉ gồm **tổng chi = tiền mặt + chuyển khoản** tháng hiện tại, không số dư hay snapshot lịch sử. Card kết quả duy nhất có tháng/ba số/thời gian cập nhật; giữ nội dung description ngoài năm nhãn do service quản lý. **Chỉ PUT description card kết quả sau khi mọi Paid hợp lệ và đã kiểm xung đột; không ghi phiếu/Amazing Fields.**
- API dự kiến `GET /health` và HTTPS `POST /v1/reconcile`. Cron-job.org gọi **19:00 VN = 12:00 UTC**; Trello button gọi khi cần. Secret cron/nút riêng ở Authorization, không tin cờ query/body. Lượt đang chạy chặn lượt sau **409**; nút gọi trong **60 giây sau lượt nút thành công** trả **429 + Retry-After** không đọc/ghi Trello hay gửi Telegram; lỗi không tạo cooldown, cron miễn cooldown nút nhưng vẫn chung khóa. Một instance, state cooldown/lock chỉ trong RAM, không DB.
- Card Paid sai/thiếu title hoặc field bắt buộc (kể cả tháng cũ) → **422 `INVALID_PAID_CARD_DATA`**, `issues` đủ `cardId`, `cardUrl`, `field`, `reason`, **không cập nhật card tổng**. Một Telegram tổng hợp/lượt lỗi có URL phiếu + field/lý do, không gửi số tiền/giá trị/chứng từ/secret. Chat đã được chủ board xác nhận **chỉ có chủ board và bot**. Telegram hỏng vẫn giữ 422 với `notification.status: "failed"`; cron bật HTTP-failure alert làm dự phòng. Lỗi Trello/hạ tầng không được đổi thành 0 hoặc 200; response thành công chỉ sau PUT.
- Trello API limits theo [Atlassian](https://support.atlassian.com/trello/docs/api-rate-limits/): **300 request/10 giây/key**, **100 request/10 giây/token**. Plan chọn **một limiter 80 request/10 giây** cho cặp key/token của service, tính mọi GET/PUT/re-read/retry; xử lý Trello `429` hữu hạn, không bỏ phiếu để chạy nhanh. Không thực hiện load test trên Trello thật.

## Lộ trình implement và bằng chứng kiểm thử

| Task | Kết quả chính |
| --- | --- |
| **P01** | Scaffold Hono/TypeScript/Node 22, pnpm, env fail-fast, health, smoke/typecheck/build. |
| **P02** | Script `verify:trello-read` **read-only pha raw**: auth, board/cards/CFG/FD, ID/pagination/archived Paid; chủ board cho phép fixture archived giả nếu cần. **Chưa chứng minh parser** ở bước này. |
| **P03** | Trello client typed, đầy đủ Paid/archived, canonical IDs, một limiter 80/10s, retry/timeouts/errors và chỉ PUT đúng card kết quả. |
| **P04** | Giải nén/map Amazing Fields; **mở rộng cùng script read-only** để kiểm bốn field và timezone với board test, fixture sanitized. |
| **P05** | Validate toàn Paid, gom issues, kiểm archived, tính ba số với asOf/VN/integer VND. |
| **P06** | Render description 5 nhãn, giữ nội dung khác, re-read/xử lý xung đột, không retry PUT mù. |
| **P07** | Telegram formatter/notifier, rút gọn tin không làm mất issues của API, redaction. |
| **P08** | API contract/auth, lock/cooldown, 400/401/409/429, response 200 chỉ sau ghi. |
| **P09** | Nối flow, full mock integration/fault/load, 0/50/150/500 Paid, response **đầy đủ** và đường xem issues an toàn khi Telegram bị cắt. |
| **P10** | README/runbook, kiểm Static/Runtime đầy đủ, System read-only → vài lượt live **có phép trên board test** để thử kết quả/idempotence/nút/cron/alert, kiểm workflow thủ công và rollout/rollback. |

Các case kiểm thử **ST1–ST3, RT1–RT11, SY1–SY6** đã gắn owner P-task và AC trong `test-plan.md`; không tick task chỉ vì code đã viết. System preflight **mọi Paid** trước khi dựng phiếu giả: chỉ kỳ vọng **5/2/3 triệu tuyệt đối** khi tháng đó không còn khoản Paid khác; nếu có, tính kỳ vọng gồm khoản hiện hữu và kiểm phần tăng 5/2/3 triệu. **Phiếu giả đã vào Paid phải giữ ở Paid**, không xóa/Discard/archive để dọn test; nếu không chấp nhận, dùng board thử cô lập có phép. Sau test archived Paid giả phải khôi phục ngay; không archive phiếu thật.

## Gate còn mở: không tự giả định đã giải quyết

- **G01–G05, G07** trong plan/test-plan phải có bằng chứng kỹ thuật/nghiệp vụ đạt trước production: card đích đúng board, quy trình con người, archived Paid, issues/operator, timezone và thời lượng đủ trong timeout host/cron. G09: Trello Automation có thể **không hiển thị** response `429` cho người bấm; thử trên board test, nếu không hiện phải chỉnh lại kỳ vọng trong spec Kế toán với chủ board, không tự thêm portal/Telegram cho 429.
- **G06** cooldown RAM reset sau restart; **G08** Trello chưa chứng minh transaction/conditional write, re-read vẫn còn race; **A05** Telegram Bot API đưa token trong URL HTTPS upstream (cấm log URL/exception chứa token). Cần chủ board chấp thuận cách xử lý hoặc sửa spec/thiết kế trước production; A05 phải rõ **trước khi gửi Telegram live**.
- Host/HTTPS cụ thể, timeout, quyền test fixture archived, Trello Automation header/free tier, parser format/date raw và production IDs **chưa kiểm chứng/chưa chọn**. System chỉ được thử sau Static/Runtime pass, dùng ít request có phép; quan sát HTTP status, card description, Telegram, cron alert và tài nguyên host nếu có. Không nhận rủi ro thiếu dữ liệu/thất bại đọc bằng cách trả 200 giả.

**Bước đầu session mới:** đọc 4 tài liệu nguồn phía trên, kiểm worktree/env **không xem secret**, bắt đầu từ **P01** theo plan, xây test theo case ownership trong test-plan. Các yêu cầu giải quyết trước live/production ở trên là gate, không phải lý do bỏ qua unit/mock implementation. Không có test nào đã được chạy hoặc bằng chứng production-ready trong session này.
