# Clarification: Theo dõi chi phí đã thanh toán trên Trello

**Giai đoạn SDD:** Specs → **Clarify** → Plan → Implement.  
**Trạng thái:** Kế toán đã duyệt bản spec trước các bổ sung mới; chủ board đã trả lời các câu hỏi clarification và hai bản [spec kỹ thuật](./specs.md), [spec nghiệp vụ](./specs-ke-toan.md) đã được cập nhật để Kế toán xem lại. File này ghi quyết định để lập plan, **không phải kế hoạch triển khai hay mã nguồn**.

## Mục tiêu kinh doanh và user stories

Giám đốc/Kế toán cần xem **tổng chi, chi tiền mặt, chi chuyển khoản của tháng hiện tại** từ các phiếu **thực sự đã trả tiền** trên Trello. Kết quả hiển thị trên **một** card `Tổng chi trong tháng`, có tháng báo cáo/thời điểm cập nhật; dữ liệu gốc của mọi tháng nằm ở các phiếu Paid/Amazing Fields, không phải ở card tổng. Khi phiếu sai thì dừng cập nhật và báo người phụ trách; không cộng thiếu hoặc báo thành công giả.

| Vai trò | Hành động cần làm |
| --- | --- |
| Người đề nghị | Tạo phiếu ở Draft, **gắn mình làm assignee**; điền tiêu đề, số tiền VND, loại chi phí, hình thức, diễn giải/chứng từ; **không nhập Ngày thanh toán**. Khi chuyển Requesting, **thêm Giám đốc làm assignee, comment @mention Giám đốc** để báo cần duyệt. |
| Giám đốc | Xem xét; khi duyệt và chuyển Approved, **thêm Kế toán làm assignee, comment @mention Kế toán** để bàn giao. |
| Kế toán | Kiểm tra phiếu và duyệt lần hai, chi tiền; **chỉ Kế toán nhập ngày/giờ thực chi trước Paid**. Khi chuyển Paid, **comment xác nhận thanh toán, ngày/giờ, hình thức**; có thể @mention người đề nghị. |
| Người chuyển cột/hủy phiếu | **Mọi lần chuyển cột đều comment** sự kiện và lý do/trạng thái, gắn/nhắc người xử lý tiếp. Phiếu chưa chi muốn archive phải **chuyển Discard, comment lý do hủy rồi mới archive**. Phiếu Paid **không chuyển Discard, không archive hoặc xóa**. |
| Người vận hành | Nhận Telegram có **link phiếu lỗi, field sai/thiếu và lý do**, mở phiếu để báo đúng người sửa; Ngày thanh toán do Kế toán sửa. |
| Hệ thống | Chỉ đọc dữ liệu Trello, xác thực tất cả Paid, cộng ba số theo tháng Việt Nam và chỉ ghi card kết quả nếu thành công; không tự gán assignee, comment, duyệt hoặc chuyển cột. |

Việc gắn người, @mention/comment, chỉ Kế toán điền ngày và chỉ người có trách nhiệm chuyển cột là **quy trình con người**, không phải quyền khóa được Trello/Amazing Fields Free cưỡng chế. Comment/assignee là audit/nhắc việc, **không** là nguồn số liệu để tính hoặc bằng chứng API tự kiểm tra người duyệt.

## Phạm vi và ràng buộc đã chốt

- **Draft → Requesting → Approved → Paid**; Discard cho phiếu chưa chi. Chỉ Paid **đang hoạt động** được cộng. Card archived **còn thuộc Paid là vi phạm quy trình**: phát hiện, dừng tính và báo để khôi phục, không bỏ qua âm thầm hay cộng như hợp lệ. Không xóa vĩnh viễn Paid vì lịch sử và phép tính lại phụ thuộc card gốc.
- Nguồn tính: `Số tiền` VND nguyên dương, `Hình thức thanh toán` Tiền mặt/Chuyển khoản và `Ngày thanh toán` trong Amazing Fields; `Loại chi phí` là field bắt buộc để giữ dữ liệu sạch cho dashboard sau. Cùng một chi phí trả nhiều lần dùng nhiều card; mỗi card Paid được tính một lần. Không dùng nhãn, description, comment, attachment hoặc avatar để thay giá trị.
- Đọc lại **mọi card Paid mỗi lượt**, kể cả tháng cũ; field bắt buộc sai ở tháng cũ cũng chặn xuất số tháng này. Tháng tính theo `Asia/Ho_Chi_Minh`, phân tháng dựa trên **ngày/giờ thanh toán thực tế**; không dùng ngày tạo hoặc ngày chuyển cột. Mốc `asOf` được chụp một lần ở đầu lượt.
- Một card `bbElWm0C` hiển thị tháng hiện tại và ba số VND; không có card/bản chốt tháng mới. Sửa phiếu tháng cũ có thể làm báo cáo lịch sử trong tương lai thay đổi. Cron ngoài Trello lúc **19:00 giờ VN**, nút Trello gọi khi cần; cả hai dùng HTTPS POST. Không làm dashboard biểu đồ, phân quyền theo vai trò hoặc số dư tiền mặt/ngân hàng trong MVP.
- Nếu thiếu/sai field Paid, API trả **422** với chi tiết card/field/lý do, **không** ghi số mới. **Một Telegram tổng hợp/lượt lỗi** tới chat vận hành có link đến phiếu, tên field sai/thiếu và lý do; không gửi số tiền, giá trị field, chứng từ, mô tả hoặc credentials. Chat chỉ gồm người có quyền xem phiếu; khi tin quá dài, nêu số phiếu chưa liệt kê và giữ chi tiết đầy đủ trong response. Không có lưu bền vững để chống trùng giữa các lượt lỗi độc lập.
- Telegram dùng `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` từ **env** do chủ board điền, không lưu vào specs/code/Trello. Không gửi Telegram được vẫn trả lỗi gốc 422 với `notification.status: "failed"` và để cron-job.org cảnh báo HTTP lỗi. Các lỗi hạ tầng giữ mã lỗi tương ứng; Telegram bắt buộc cho lỗi field Paid, không mặc định cho mọi lỗi.
- **Rate-limit nút thủ công:** hai secret env riêng `RECONCILE_BUTTON_SECRET` / `RECONCILE_CRON_SECRET` để phân biệt nguồn gọi đáng tin, không dựa vào query/body. Sau **một lượt nút thành công**, chặn nút toàn board **60 giây tính từ lúc hoàn tất**, trả `429` + `Retry-After` mà không gọi Trello/Telegram. Lượt lỗi **không** tạo cooldown để sửa rồi thử ngay; nhấn lại liên tục khi lỗi chưa sửa có thể gửi nhiều Telegram. Cron không chịu cooldown nút nhưng **không chạy chồng** với lượt đang xử lý (trả `409` cho yêu cầu tới sau). Giới hạn này phải có hiệu lực trên thực tế: một instance hoặc tầng rate-limit dùng chung nếu có nhiều instance.
- Amazing Fields pluginData là format nội bộ; schema/option thay đổi không đọc được thì dừng an toàn, không lấy comment lịch sử làm số liệu thay thế. Dịch vụ không lưu dữ liệu kế toán vào DB/file; Trello là nguồn lưu trữ.

### Làm rõ cách đọc và giải mã Amazing Fields

Amazing Fields **không lưu bốn field cần tính ở Trello native Custom Fields**. API đọc cấu hình `CFG` của đúng Amazing Fields Power-Up (`AMAZING_FIELDS_PLUGIN_ID`) từ `GET /boards/{TRELLO_BOARD_ID}/pluginData`, và dữ liệu `FD` của từng phiếu Paid từ `GET /cards/{cardId}/pluginData`. Lọc theo Power-Up, dùng `LZString.decompressFromUTF16` để giải nén phần dữ liệu tương ứng, rồi parse JSON. Dùng cấu hình board để đối chiếu **ID field** của card với `Số tiền`, `Loại chi phí`, `Hình thức thanh toán`, `Ngày thanh toán` và đối chiếu **ID option** với lựa chọn thực tế; không đọc số tiền từ chuỗi VND hiển thị trên giao diện, description hoặc comment.

Sau khi giải mã, kiểm tra đúng board/schema/type, bốn field và option hợp lệ. Chuyển giá trị `Số tiền` thành **số nguyên VND dương**, phương thức thành **Tiền mặt hoặc Chuyển khoản**, ngày/giờ thanh toán thành thời điểm để phân tháng theo `Asia/Ho_Chi_Minh`; giữ `Loại chi phí` hợp lệ cho dashboard sau. Chỉ dữ liệu **đã giải mã và kiểm tra thành công** mới đi vào phép cộng; thiếu field, không giải nén/parse được hoặc Power-Up đổi format thì dừng và báo lỗi, không tự đoán giá trị hay ghi đè card kết quả. Bước Plan cần kiểm chứng parser trên board test với dữ liệu thật và tình huống schema thay đổi; chi tiết kỹ thuật nằm ở [spec mục 3–4](./specs.md).

## Tiêu chí nghiệm thu (explicit từ specs và quyết định clarification)

1. Trong tháng có phiếu Paid tiền mặt **2.000.000 VND** và chuyển khoản **3.000.000 VND**: card/API trả **5.000.000 / 2.000.000 / 3.000.000 VND**; phiếu Approved/Discard không cộng, lặp chạy không cộng chồng.
2. Draft gắn người đề nghị; Requesting thêm Giám đốc và comment @mention; Approved thêm Kế toán và comment @mention; Paid chỉ sau khi Kế toán điền ngày/giờ và comment xác nhận. Mọi chuyển cột, gồm chuyển ngược và hủy, có comment để audit. Đây là thao tác của người dùng, API không giả vờ tự kiểm soát quyền.
3. Archive **phiếu chưa chi**: chuyển Discard và comment trước. **Không archive Paid**; nếu Trello có card archived còn ở Paid, không xuất tổng mới mà báo rõ để khôi phục. Không chuyển Paid sang Discard để hoàn/đảo chi.
4. Phiếu Paid thiếu/sai field (kể cả tháng cũ) → lỗi 422 nêu phiếu/field, **không ghi số mới**, Telegram chứa **link đúng phiếu, field và lý do** cho chat đã được phép xem; không chứa số tiền/chứng từ/secret. Telegram lỗi → 422 và `notification.status: "failed"`; cron-job.org cảnh báo dự phòng.
5. Nút bấm lần tiếp trong 60 giây **sau lượt thành công** → 429 + `Retry-After`, không chạy/gửi tin; sau lượt lỗi có thể bấm lại ngay. Cron với secret riêng không bị cooldown nhưng không chạy chồng. Card kết quả chỉ có **một card duy nhất** được cập nhật cho tháng hiện tại.

## Kiểm chứng suy ra để đưa vào Plan (không thêm phạm vi)

- Không có phiếu Paid hoặc một phương thức không có giao dịch → các dòng tương ứng là **0 VND sau khi chạy thành công**; template còn trống không phải 0.
- Trong cùng một lượt có nhiều lỗi → danh sách `issues` đầy đủ trong response, Telegram **một tin tổng hợp**, số phiếu lỗi là số card riêng biệt; tin có thể rút gọn nếu dài nhưng không giấu rằng còn lỗi.
- Cần bảo đảm người vận hành đọc được response/log khi Telegram cắt bớt danh sách; thử ca lỗi end-to-end với nút và cron. Nếu bấm lỗi lặp lại, Telegram có thể lặp tin vì đã chọn cho retry lỗi không cooldown.
- Kiểm tra thao tác nhập ngày/giờ trên board test tại ranh giới tháng và múi giờ thiết bị; phía tính toán luôn dùng giờ Việt Nam. Ngày 1 trước cron 19:00, có thể bấm nút để cập nhật ngay; cho đến lúc đó card cũ vẫn ghi rõ tháng/thời gian cũ.
- Khi cron và nút hoặc hai người bấm đồng thời, chỉ một lượt xử lý; nếu nguồn bị sửa lúc đọc hoặc không thể xác nhận snapshot ổn định trước ghi, dừng an toàn và chạy lại. Nếu có nhiều instance, cần cơ chế giới hạn/điều phối chung trước go-live.
- Giữ field/option ID và không xóa Paid; nếu Amazing Fields đổi schema thì kiểm tra parser trên board test. Giám sát thời gian `Cập nhật` và lỗi host/Trello ngay cả khi những lỗi này không nằm trong cảnh báo Telegram dành cho field sai.

**Điều kiện trước khi chuyển Plan:** chủ board sẽ cấp env bot/chat Telegram, hai secret cron/nút và Trello board test/production trên host thích hợp; xác nhận nhóm chat nhận link phiếu chỉ gồm người có quyền truy cập. Các ngưỡng rate-limit, xử lý archive, nội dung cảnh báo và trách nhiệm assignee/comment đã được chốt ở đây, không cần hỏi lại.
