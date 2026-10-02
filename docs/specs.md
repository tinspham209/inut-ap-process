# Đặc tả kỹ thuật: Theo dõi chi phí đã thanh toán trên Trello

**Trạng thái:** Bản nghiệp vụ trước đó đã được Kế toán duyệt; các bổ sung của chủ board trong [clarification.md](./clarification.md) được cập nhật tại đây để Kế toán xem lại. Chức năng chưa triển khai. [Bản dành cho Kế toán](./specs-ke-toan.md).

## 1. Mục tiêu và phạm vi

Một card Trello duy nhất, [`Tổng chi trong tháng`](https://trello.com/c/bbElWm0C), hiển thị **Tổng chi trong tháng**, **Chi tiền mặt trong tháng**, **Chi chuyển khoản trong tháng**, tổng chi theo từng hạng mục có phát sinh, tháng báo cáo và thời gian cập nhật. Đơn vị VND; tổng chi bằng tổng hai phương thức, đồng thời bằng tổng theo hạng mục. Đây là số **đã chi**, không phải số dư quỹ hoặc tài khoản.

Card này chỉ hiển thị tháng hiện tại, không phải kho dữ liệu hoặc bản chốt sổ: **không tạo card mới mỗi tháng**. Dữ liệu gốc của mọi tháng là các phiếu ở Paid. Nếu sửa một phiếu cũ, báo cáo lịch sử được truy vấn sau này có thể thay đổi. MVP có tổng theo hạng mục của tháng hiện tại nhưng không xuất báo cáo các tháng trước, biểu đồ lịch sử, hoặc tính tiền thu/số dư. Dashboard lịch sử theo hạng mục ở mục 7 là giai đoạn sau.

## 2. Quy trình phiếu, assignee và audit

| Cột | Ai thực hiện, điều kiện và thao tác trên card |
| --- | --- |
| `Draft` | Người đề nghị tạo card, **thêm chính mình làm assignee**, nhập tiêu đề, `Số tiền`, `Loại chi phí`, `Hình thức thanh toán` vào Amazing Fields, ghi mục đích trong description native, đính kèm chứng từ. **Để trống `Ngày thanh toán`.** |
| `Requesting` | Người đề nghị chuyển Draft → Requesting, **thêm Giám đốc làm assignee**, comment trên card **@mention Giám đốc** báo cần duyệt. |
| `Approved` | Giám đốc duyệt, chuyển Requesting → Approved, **thêm Kế toán làm assignee**, comment **@mention Kế toán** báo cần kiểm tra/thanh toán. Kế toán xem lại chứng từ, số tiền, loại và hình thức thực tế, duyệt lần hai rồi chi tiền. |
| `Paid` | **Chỉ Kế toán** nhập ngày/giờ thực chi vào Amazing Fields, xác nhận đã lưu đúng rồi mới chuyển Approved → Paid. Kế toán comment trên card xác nhận đã thanh toán, ngày/giờ và hình thức để lưu dấu vết; có thể @mention người đề nghị. **Không archive, chuyển Discard hay xóa vĩnh viễn phiếu Paid.** |
| `Discard` | Chỉ phiếu **chưa thanh toán** từ Draft/Requesting/Approved. Người chuyển comment lý do hủy, @mention người liên quan. Muốn archive phiếu chưa chi, **phải chuyển sang Discard và comment trước, rồi mới archive**. Nếu dùng lại, khôi phục về Draft/Requesting và duyệt lại. |

**Mọi lần chuyển cột**, kể cả chuyển ngược hoặc đưa phiếu sang Discard, đều cần comment ghi sự kiện và lý do/trạng thái; nếu có người xử lý ở cột mới thì @mention và gắn assignee phù hợp. Trello ghi tài khoản/thời điểm comment. Giữ các assignee đã thêm để truy vết nếu nhóm không chủ động thay đổi quy ước. Comment/assignee là **nhắc việc và audit**, không phải nguồn tính toán; API không tạo comment, gán người, duyệt, tự chuyển cột hay xác minh hai lần duyệt. Trello Free/Amazing Fields Free không cưỡng chế quyền chỉ Kế toán được điền `Ngày thanh toán`/chuyển Paid, không bắt buộc điền field trước khi tạo hoặc cưỡng chế comment. Các bước này phải được người dùng tuân thủ và kiểm tra qua lịch sử khi cần.

Một phiếu Paid là **một lần thanh toán** bằng đúng một phương thức. Trả nhiều đợt thì tạo nhiều phiếu, có thể gắn link Trello native giữa chúng để đối chiếu; mỗi phiếu được cộng một lần riêng. Phiếu đã chi phải **ở Paid lâu dài** để việc tính lại và dashboard lịch sử không mất khoản chi. Discard không phải nơi lưu hoặc đảo khoản đã chi.

## 3. Dữ liệu và nguồn sự thật

Board thử nghiệm `DfIesTRJ`, Paid list `6ab1722c3ff9a38479bc155e`, card kết quả `bbElWm0C`; cấu hình ID qua env để đổi sang production. Service **chỉ ghi description native của card kết quả**; không ghi phiếu chi, Amazing Fields, nhãn hay comment. Không có nhãn `already-check`.

| Trường | Nguồn/quy tắc |
| --- | --- |
| Tiêu đề | Tên card native, không được trống. |
| `Số tiền` | Amazing Fields, số nguyên VND dương; giao diện hiển thị tiền tệ VND, không tính từ chuỗi đã định dạng hoặc quy đổi ngoại tệ. |
| `Loại chi phí` | Amazing Fields, đúng một lựa chọn hợp lệ; dùng để nhóm tổng chi theo hạng mục trong tháng hiện tại và làm dữ liệu cho dashboard lịch sử sau này. |
| `Hình thức thanh toán` | Amazing Fields, đúng một trong `Tiền mặt` / `Chuyển khoản`; Kế toán xác nhận lại trước Paid. |
| `Ngày thanh toán` | Amazing Fields, **chỉ Kế toán nhập ngày và giờ thực chi trước Paid**; người đề nghị để trống. Dùng để phân tháng theo `Asia/Ho_Chi_Minh`. |
| Description/attachments/link/assignee/comment | Chứng từ, diễn giải và audit; **không** dùng làm số liệu chi hoặc thay thế một field thiếu. |

Amazing Fields Power-Up `60e068efb294647187bbe4f5` hiện có bốn field cần dùng. Board mapping `CFG` được đọc từ `GET /boards/{id}/pluginData`; card values `FD` từ `GET /cards/{id}/pluginData`. Giải nén với `LZString.decompressFromUTF16` rồi parse JSON; map theo field/option ID của board config, kiểm tra board ID, version/schema/type và option duy nhất. Bỏ qua key của field đã xóa nhưng không bỏ qua field bắt buộc hiện tại; không dùng comment lịch sử hoặc nhãn làm nguồn thay thế. Plugin payload là format nội bộ: nếu không đọc được thì **dừng an toàn**, không suy diễn ra số.

## 4. Phép tính tháng

Chốt `asOf` tại đầu lượt chạy. Tháng báo cáo theo giờ `Asia/Ho_Chi_Minh` là khoảng từ **00:00 ngày 1 (bao gồm)** đến **00:00 ngày 1 tháng sau (không bao gồm)**. Đọc và kiểm tra **tất cả card ở Paid**, kể cả phiếu các tháng trước, không đọc phiếu Draft/Requesting/Approved/Discard. Lấy cả trạng thái archive để **phát hiện card archived vẫn thuộc Paid**: đây là vi phạm quy trình, **dừng, báo lỗi**, không lặng lẽ bỏ qua hoặc tính như bình thường; cần người phụ trách khôi phục. Archive phiếu chưa chi sau khi chuyển Discard không ảnh hưởng.

Mỗi card Paid phải có tiêu đề, số nguyên VND dương (và tổng an toàn), đúng một loại chi phí, đúng một phương thức, timestamp thanh toán hợp lệ **không sau `asOf`**. Quy đổi thời điểm Amazing Fields về giờ Việt Nam trước khi phân tháng. Chỉ cộng card có Ngày thanh toán trong tháng báo cáo và không sau `asOf`. Với mỗi card đủ điều kiện, cộng `Số tiền` một lần vào đúng một phương thức và đúng một hạng mục theo option `Loại chi phí`:

```text
Chi tiền mặt trong tháng     = tổng Số tiền của các card Paid chọn Tiền mặt
Chi chuyển khoản trong tháng = tổng Số tiền của các card Paid chọn Chuyển khoản
Tổng chi trong tháng         = Chi tiền mặt trong tháng + Chi chuyển khoản trong tháng
Chi theo hạng mục H          = tổng Số tiền các card Paid trong tháng chọn hạng mục H
```

Dùng số nguyên VND và phép cộng an toàn. Tổng của các hạng mục có phát sinh phải bằng **Tổng chi trong tháng**; nếu tổng tiền hoặc tổng theo hạng mục vượt miền số nguyên an toàn, dừng với lỗi, không ghi card kết quả. Nếu không có phiếu đủ điều kiện, tổng tiền mặt, tổng chuyển khoản, tổng chi và mọi tổng hạng mục đều bằng **0 VND sau lượt chạy thành công**.

Trong description, hiển thị riêng các hạng mục có tổng lớn hơn 0; bỏ qua option hạng mục có tổng bằng 0. Sắp xếp theo thứ tự option của field `Loại chi phí` trong Amazing Fields board config, không sắp theo số tiền hoặc tên. Luôn giữ heading `Chi theo hạng mục trong tháng:`; nếu không có hạng mục nào phát sinh thì không có dòng hạng mục bên dưới heading. Mỗi card ID tính nhiều nhất một lần/lượt; không cộng vào tổng lần trước. Sửa field hoặc di chuyển card sẽ được phản ánh ở lượt kế tiếp. Không lấy ngày tạo, ngày comment hoặc ngày chuyển cột thay Ngày thanh toán.

Trong description, `Cập nhật: <dd/MM/yyyy HH:mm>` nằm ngay dưới `Tháng báo cáo`. Heading `Chi theo hạng mục trong tháng:` và các dòng `- <Tên hạng mục>: <Số tiền đã định dạng> VND` sau heading là vùng do service quản lý; heading luôn hiện, kể cả khi không có dòng hạng mục. Mỗi lượt thành công thay toàn bộ các dòng do service quản lý theo báo cáo mới; không coi các dòng này là nội dung do người dùng quản lý. Nội dung description bên ngoài các nhãn cố định và vùng hạng mục phải được giữ nguyên. Tên hạng mục phải là một dòng đơn; nếu cấu hình có nhãn rỗng hoặc chứa line break khiến dòng không thể render an toàn, dừng trước khi ghi kết quả.

## 5. API, giới hạn bấm nút và ghi kết quả

Hono cung cấp HTTPS `POST /v1/reconcile`; cron-job.org gọi lúc **19:00 giờ Việt Nam mỗi ngày** (12:00 UTC), nút board/card Trello gọi khi cần xem ngay. `GET /health` không tính hoặc ghi dữ liệu. **Hai secret riêng** ở header `Authorization`: `RECONCILE_CRON_SECRET` cho cron và `RECONCILE_BUTTON_SECRET` cho nút; không tin query/body tự khai nguồn gọi để miễn giới hạn. Trello API key/token riêng; không truyền bất kỳ secret nào qua URL/payload/log.

**Nút thủ công:** tối đa **một lượt thành công mỗi 60 giây trên toàn board**, cooldown bắt đầu lúc lượt thành công hoàn tất. Yêu cầu nút trong cooldown trả `429` và `Retry-After` (giây còn lại), **không đọc Trello, không ghi card, không gửi Telegram**. Một lượt đang chạy dở không được chạy chồng: trả `409` cho lượt đến sau (kể cả cron). Lượt thất bại **không tạo cooldown** để người dùng sửa dữ liệu rồi thử lại; nếu liên tục gọi khi vẫn sai có thể phát nhiều Telegram, cần lưu ý vận hành. Secret cron miễn cooldown nút, **không** miễn quy tắc chống chạy chồng. Chỉ lưu metadata thời gian/cooldown tạm trong bộ nhớ, không lưu dữ liệu kế toán; một instance hoặc tầng rate-limit dùng chung là điều kiện để giới hạn chính xác khi deploy.

Sau khi đọc và kiểm tra đầy đủ, chỉ cập nhật các dòng do service quản lý trong description card `Tổng chi trong tháng`, giữ nguyên nội dung ngoài phần service quản lý. Ngoài năm dòng cố định, vùng hạng mục gồm heading cố định và các dòng hạng mục phát sinh theo option hiện hành:

```text
Tháng báo cáo: 09/2026
Cập nhật: 28/09/2026 19:00
Tổng chi trong tháng: 5,000,000 VND
Chi tiền mặt trong tháng: 2,000,000 VND
Chi chuyển khoản trong tháng: 3,000,000 VND
Chi theo hạng mục trong tháng:
- Hạng mục A: 1,000,000 VND
- Hạng mục B: 4,000,000 VND
```

Ví dụ số liệu và tên hạng mục trên chỉ là dữ liệu minh họa, không phải số thật; giờ hiển thị là giờ Việt Nam. Các tổng theo hạng mục trong ví dụ cộng thành tổng chi. VND trên card hiển thị với dấu phẩy phân tách hàng nghìn; giá trị trong API vẫn là số nguyên VND. Card mẫu chưa chạy không đồng nghĩa tổng bằng 0. Khi sang tháng, card cũ còn hiển thị tháng/timestamp cũ đến lượt cập nhật thành công tiếp theo; không tạo card mới hoặc lấy lịch sử từ card kết quả. Kiểm tra giới hạn description, xung đột cập nhật và board/list/card đích trước ghi. Không xuất bản kết quả từ tập dữ liệu đọc không nhất quán khi người dùng sửa phiếu giữa lượt.

Response chỉ thành công sau khi ghi xong, gồm `status`, `month`, `asOf`, `totalSpentVnd`, `cashSpentVnd`, `bankTransferSpentVnd`, `spentByExpenseType` và `updatedCardUrl`. `spentByExpenseType` là mảng `{expenseType, spentVnd}` chỉ gồm hạng mục có tổng lớn hơn 0, sắp xếp theo thứ tự option của Amazing Fields; `spentVnd` là số nguyên VND chưa định dạng. Nếu không có hạng mục phát sinh, mảng rỗng. Ví dụ cấu trúc (tên và số liệu giả):

```json
{
  "spentByExpenseType": [
    { "expenseType": "Hạng mục A", "spentVnd": 1000000 },
    { "expenseType": "Hạng mục B", "spentVnd": 4000000 }
  ]
}
```

Bảo đảm tổng bằng hai khoản thành phần và bằng tổng các phần tử trong `spentByExpenseType`. `400/401` cho yêu cầu sai/không xác thực; `409` cho lượt đang chạy/xung đột; `429` cho cooldown; `502/503` cho lỗi Trello/rate limit của Trello. Không trả 200 nếu tính hoặc ghi thất bại.

## 6. Lỗi dữ liệu, Telegram và vận hành

Kiểm tra toàn bộ Paid **trước khi ghi**. Với card thiếu/sai tiêu đề, `Số tiền`, `Loại chi phí`, `Hình thức thanh toán`, `Ngày thanh toán` hoặc không giải mã đúng field bắt buộc: trả **HTTP 422** với `code: "INVALID_PAID_CARD_DATA"` và danh sách `issues` gồm `cardId`, `cardUrl`, `field`, `reason` (`missing`, `invalid_format`, `invalid_value`, ...). Cố gắng trả **đầy đủ vấn đề phát hiện được** thay vì bỏ qua card sai, không ghi ba số mới.

Gửi **một tin Telegram tổng hợp/lượt lỗi** đến chat vận hành: thời điểm, số phiếu lỗi, **link mở từng phiếu lỗi trên Trello**, tên field sai/thiếu và lý do. Khi quá dài, giới hạn tin và nói rõ còn bao nhiêu phiếu chưa liệt kê; response vẫn có danh sách đầy đủ. **Không gửi số tiền, giá trị field, nội dung mô tả, chứng từ, raw payload hay credentials.** Chat nhận tin phải chỉ có người được phép xem các phiếu; encode/escape nội dung để tránh link giả hoặc lỗi định dạng. Người vận hành mở card, nhờ người đề nghị/Kế toán sửa (Ngày thanh toán do Kế toán sửa), rồi chạy lại.

Gửi Telegram qua HTTPS với timeout và retry hữu hạn khi lỗi tạm thời. Nếu Telegram lỗi, vẫn giữ mã lỗi dữ liệu gốc `422`, trả `notification.status: "failed"` và ghi lỗi có kiểm soát; gửi được thì `"sent"`. Cron-job.org cần bật cảnh báo khi HTTP thất bại làm kênh dự phòng. `429`/`409` do bấm nút nhanh/chạy chồng **không phải lỗi field**, không gửi Telegram. Lỗi hạ tầng/API khác giữ mã lỗi phù hợp; Telegram **bắt buộc với lỗi field Paid** chứ không mặc định gửi với mọi lỗi. Lỗi archived Paid phải trả lỗi rõ card để khôi phục; không được xuất bản số mới. Secret Telegram chỉ từ env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` do chủ board điền; thiếu cấu hình là lỗi phải hiện rõ, không âm thầm bỏ qua. Không có DB bền vững để chống gửi trùng giữa các lượt lỗi độc lập.

Env tối thiểu: `TRELLO_API_KEY`, `TRELLO_API_TOKEN`, `TRELLO_BOARD_ID`, `TRELLO_PAID_LIST_ID`, `TRELLO_RESULT_CARD_ID`, `AMAZING_FIELDS_PLUGIN_ID`, `RECONCILE_CRON_SECRET`, `RECONCILE_BUTTON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PORT` nếu host yêu cầu. Không commit credentials, không lưu dữ liệu kế toán vào DB/file/field khác.

## 7. Tiêu chí nghiệm thu và giai đoạn dashboard

1. Card Paid trong tháng 2.000.000 VND tiền mặt và 3.000.000 VND chuyển khoản → tổng tiền mặt/chuyển khoản/tổng chi **2.000.000 / 3.000.000 / 5.000.000 VND** trên card và API, cùng breakdown theo `Loại chi phí` có tổng các hạng mục bằng 5.000.000 VND. Card/API hiển thị VND có dấu phẩy phân tách hàng nghìn, còn API giữ số nguyên. Hạng mục 0 không hiện thành dòng; thứ tự theo Amazing Fields option. Draft/Requesting/Approved/Discard không tính. Hai phiếu trả hai đợt được cộng riêng.
2. Người tạo gắn chính mình ở Draft; khi Requesting thêm Giám đốc và comment @mention; khi Approved thêm Kế toán và comment @mention; trước Paid Kế toán nhập ngày/giờ thực chi và khi chuyển Paid comment xác nhận. Mọi chuyển cột có comment; phiếu chưa chi được comment/chuyển Discard trước archive; Paid **không archive**. API không giả vờ cưỡng chế quy trình con người.
3. Phiếu Paid thiếu/sai field, kể cả của tháng cũ, → toàn lượt lỗi `422`, không ghi kết quả; Telegram có link đúng phiếu + field/lý do nhưng không chứa số tiền/chứng từ/secret. Nếu Telegram lỗi, response giữ 422 và báo trạng thái gửi thất bại. Archive còn ở Paid → dừng, báo lỗi; không bỏ phiếu khỏi tổng trong im lặng.
4. Ranh giới 23:59 cuối tháng / 00:00 đầu tháng theo giờ VN, chạy lại không nhân đôi, sửa phiếu ở Paid phản ánh lần sau; một card kết quả duy nhất đổi tháng sau lần chạy mới.
5. Nút bấm trong **60 giây sau lượt thành công** trả `429`/`Retry-After`, không gọi Trello/Telegram; lỗi không tạo cooldown; cron secret riêng không bị cooldown. Request đang xử lý không chạy chồng. Các lỗi Power-Up/Trello không trả thành công giả.

**Dashboard lịch sử giai đoạn sau:** một ứng dụng riêng đọc các card Paid của những tháng cần báo cáo, nhóm theo **tháng thanh toán × Loại chi phí** (có thể thêm phương thức). Breakdown theo hạng mục trên card tổng chỉ thuộc tháng hiện tại; không lấy lịch sử từ card này. Chỉnh sửa phiếu Paid cũ sẽ làm báo cáo lịch sử tính lại; nếu cần khóa số tháng đã chốt thì phải đặc tả/lưu bản chốt riêng trước khi xây dashboard.

### Tham chiếu

- [Trello REST OpenAPI v3](https://dac-static.atlassian.com/cloud/trello/swagger.v3.json?_v=1.1245.0). `GET /boards/{id}/pluginData` đã đọc được trên board test nhưng không liệt kê trong OpenAPI này; kiểm tra tính tương thích trước triển khai.
- [Trello Automation HTTP requests](https://support.atlassian.com/trello/docs/issuing-http-requests/) — POST hỗ trợ custom headers.
