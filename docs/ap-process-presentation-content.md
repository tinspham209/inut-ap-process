# Nội dung thuyết trình: AP Process

**Mục đích:** giới thiệu quy trình và thống nhất cách áp dụng giữa người đề nghị chi, Giám đốc, Kế toán và người vận hành.  
**Thời lượng mục tiêu:** 8–10 phút. **Ngôn ngữ:** tiếng Việt, giữ tên cột/field trên Trello.  
**Phạm vi tài liệu này:** nội dung và mạch lập luận; chưa phải slide, script thuyết trình hay hướng dẫn thao tác chi tiết.

> **Trạng thái:** bản nháp để chốt thông điệp. Phần số liệu đo lường và cảm nhận cá nhân đang để chỗ trống. Chỉ điền dữ liệu aggregate đã kiểm tra; không đưa ảnh chụp, tên phiếu, người nhận tiền hay nội dung giao dịch thật vào bản lưu trong repo.

## Thông điệp chính

AP Process tạo một luồng rõ ràng từ lúc đề nghị chi đến khi khoản tiền thực sự được thanh toán. Mỗi phiếu cần nói rõ khoản chi phục vụ mục đích gì, thuộc hạng mục nào và ai đang xử lý; Giám đốc và Kế toán có bước xem xét trước khi phiếu được ghi nhận là đã chi. Khi dữ liệu đã được nhập đầy đủ và phiếu ở `Paid`, Trello có thể hiển thị tổng chi tháng hiện tại theo phương thức thanh toán và hạng mục, thay vì chờ đến cuối tháng mới tổng hợp riêng.

Đây là sự thay đổi về **quy trình và chất lượng dữ liệu**, không phải công cụ tự phê duyệt hay thay thế sổ quỹ.

## Bối cảnh và vấn đề cần giải quyết

Trước AP Process, thông tin đề nghị chi và số liệu tổng hợp được theo dõi qua các bước/công cụ khác nhau. Từ những vấn đề đã nêu:

- Nội dung chi tiêu đôi khi còn chung chung, chưa trả lời rõ khoản chi phục vụ việc gì.
- Người xem khó lần từ một khoản chi đến hạng mục, mục đích và người nhận/người được hưởng khoản chi.
- Trách nhiệm và trạng thái bàn giao giữa người đề nghị, người duyệt và Kế toán chưa luôn thể hiện rõ.
- Bước review/approve trước khi thanh toán cần được làm rõ để đánh giá khoản chi có hợp lý và đủ chứng từ hay không.
- Tổng chi theo hạng mục thường chỉ sẵn sau lần tổng hợp cuối tháng; trong kỳ khó xem tình hình hiện tại.
- Việc tổng hợp cuối tháng phụ thuộc vào thao tác tổng hợp thủ công, nên có thể tốn thời gian và khó truy lại cách một khoản được phân loại.

Đây là **khoảng trống của cách tổ chức quy trình và dữ liệu**, không quy lỗi cho một cá nhân. Khi cần nhắc đến người đang tạo/request phiếu, chỉ dùng tên vai trò **“người đề nghị chi”**, không nêu tên riêng.

### Phân biệt với Sổ quỹ

`SỔ QUỸ 2026.xlsx` là sổ theo dõi thu/chi và các nội dung hỗ trợ đối soát. AP Process trên Trello tập trung vào **đề nghị chi và các khoản chi đã thanh toán**. Trello không thay thế sổ quỹ, không tính tiền thu hoặc số dư tiền mặt/ngân hàng, và không phải bản chốt sổ kế toán.

Khi thu thập baseline từ workbook, chỉ dùng số tổng hợp cần thiết cho phần trình bày. Không chép dòng giao dịch, tên người nhận, chứng từ hay nội dung riêng lẻ vào tài liệu này.

## Mục tiêu của AP Process

1. **Làm rõ đề nghị chi:** ghi tiêu đề, mục đích, số tiền, loại chi phí, hình thức thanh toán và chứng từ cần thiết ngay trên phiếu.
2. **Rõ người chịu trách nhiệm ở từng bước:** requester tạo và gửi; Giám đốc review; Kế toán kiểm tra, thanh toán và ghi thời điểm thực chi.
3. **Tạo dấu vết bàn giao:** assignee và comment cho biết ai cần xử lý tiếp và trạng thái/lý do khi phiếu chuyển cột.
4. **Nhìn được số đã chi trong tháng:** một card kết quả hiển thị tháng báo cáo, thời gian cập nhật, tổng chi, tiền mặt, chuyển khoản và breakdown theo hạng mục.
5. **Giữ dữ liệu có thể truy lại:** từng khoản chi vẫn nằm ở phiếu Trello gốc; card kết quả chỉ là phần tổng hợp tháng hiện tại.

### Ngoài phạm vi

- Hệ thống không tự quyết định khoản chi có hợp lý hay không; việc review/approve do người có trách nhiệm thực hiện.
- Mục đích chi hiện được mô tả bằng nội dung phiếu/chứng từ; service không đánh giá nội dung có đủ rõ và hiện không có field người nhận/người hưởng riêng. Nhóm cần thống nhất nơi và cách ghi thông tin này; không trình bày nó như phần dữ liệu đã được service kiểm tra.
- Hệ thống không tự assign người, comment, chuyển cột hoặc nhập Ngày thanh toán.
- Hệ thống không thay thế Sổ quỹ, không tính số dư, không tạo bản chốt sổ và không cung cấp dashboard lịch sử theo tháng.
- Trello Free không cưỡng chế vai trò hoặc bắt buộc người dùng hoàn tất mọi bước; nhóm cần tuân thủ quy trình và xem activity khi cần.
- Mục đích và người nhận/người hưởng cần được ghi theo quy ước thống nhất trong phần mô tả/tham chiếu của phiếu. Nếu muốn field người nhận có cấu trúc và được kiểm tra tự động, đó là một thay đổi phạm vi cần được duyệt riêng.

## Quy trình ở mức tổng quan

`Draft → Requesting → Approved → Paid`

- **Người đề nghị chi:** tạo phiếu ở `Draft`; điền mục đích, tiêu đề, số tiền, loại chi phí, hình thức thanh toán và chứng từ; để Ngày thanh toán trống. Khi gửi sang `Requesting`, assign Giám đốc và comment @mention để yêu cầu review.
- **Giám đốc:** xem mục đích, tính hợp lý và thông tin đề nghị. Khi duyệt, chuyển sang `Approved`, assign Kế toán và comment @mention bàn giao.
- **Kế toán:** kiểm tra chứng từ, số tiền, hạng mục và hình thức thực tế trước khi thanh toán. Sau khi trả tiền, nhập ngày **và giờ** thực chi, kiểm tra đã lưu đúng rồi mới chuyển sang `Paid`; comment xác nhận việc thanh toán.
- **Phiếu không tiếp tục:** nếu chưa chi, chuyển sang `Discard` và comment lý do trước khi archive. Phiếu đã `Paid` phải được giữ ở `Paid`, không archive, xóa hoặc chuyển `Discard`.
- **Service:** đọc lại tất cả phiếu `Paid`, kiểm tra dữ liệu rồi tính lại tháng hiện tại theo giờ Việt Nam. Khi lượt chạy thành công, service cập nhật duy nhất card kết quả; không sửa phiếu nguồn.

Mỗi lần chuyển cột, kể cả chuyển ngược để sửa, cần comment sự kiện/lý do và gắn hoặc @mention người tiếp theo nếu có. Comment/assignee hỗ trợ phối hợp và truy vết; chúng không thay thế các field Amazing Fields dùng để tính.

### Kết quả hiển thị

Card kết quả được cập nhật theo thứ tự: `Tháng báo cáo`, `Cập nhật`, `Tổng chi trong tháng`, `Chi tiền mặt trong tháng`, `Chi chuyển khoản trong tháng`, rồi `Chi theo hạng mục trong tháng`. Các giá trị VND trên card có dấu phẩy phân tách hàng nghìn. Hạng mục không phát sinh không có dòng riêng; tổng các hạng mục phải bằng tổng chi.

Theo xác nhận của chủ board, production hiện có trigger khi ticket vào `Paid`, nút `Trigger Get Total` và cron 19:00 giờ Việt Nam. Host có thể ngủ khi idle và cần khoảng 50–60 giây cold start. Bố cục card đã được chủ board kiểm tra qua localhost. Đây là trạng thái owner-reported, không thay thế bằng chứng nghiệm thu đầy đủ P10 về deadline host, alert, failure/rollback và các kiểm tra system còn lại.

## Giá trị kỳ vọng

### Trong ngắn hạn

- Người đề nghị biết cần ghi gì để người duyệt hiểu khoản chi và mục đích.
- Người duyệt và Kế toán có điểm bàn giao rõ ràng hơn; trạng thái phiếu dễ nhìn hơn.
- Kế toán có thể xem tổng chi tháng hiện tại theo tiền mặt, chuyển khoản và hạng mục sau lượt chạy thành công, không phải đợi một báo cáo tổng hợp cuối tháng để thấy các tổng này.
- Khi một số tổng hoặc field sai, có thể lần về phiếu nguồn thay vì chỉ nhìn một con số tổng không rõ thành phần.

### Trong dài hạn

- Hình thành dữ liệu có cấu trúc hơn cho việc đối chiếu theo tháng, phương thức và hạng mục.
- Hỗ trợ phân tích xu hướng và lập ngân sách tốt hơn nếu sau này triển khai báo cáo lịch sử phù hợp.
- Cải thiện khả năng truy vết khoản chi khi người dùng ghi mục đích/chứng từ và giữ phiếu `Paid` theo đúng quy tắc.

Đây là **lợi ích kỳ vọng**, chưa phải mức tiết kiệm thời gian hay giảm lỗi đã được đo. Chỉ chuyển thành tuyên bố kết quả sau khi có baseline và số liệu pilot so sánh được.

## Số liệu cần thu thập để chứng minh giá trị

### Baseline từ Sổ quỹ Excel

Chọn cùng một nhóm **2–3 tháng đã hoàn tất** trước khi áp dụng. Điền số tổng hợp vào bản trình bày sau khi Kế toán xác nhận; nếu workbook không có trường hoặc lịch sử cần thiết thì ghi “không có dữ liệu”, không suy luận từ mô tả giao dịch.

| Chỉ số | Cách thu thập baseline | Giá trị sẽ điền |
| --- | --- | --- |
| Thời điểm có breakdown hạng mục | Ghi ngày/giờ báo cáo theo hạng mục được xem là hoàn tất sau cuối tháng. Dùng lịch sử/version/email nếu có; thời gian sửa file không tự nó chứng minh báo cáo đã hoàn tất. | `[ngày/giờ hoặc số ngày sau cuối tháng]` |
| Công sức tổng hợp cuối tháng | Hỏi người thực hiện và ghi thời gian thật đã dành để phân loại, rà soát, đối chiếu; nếu không có log cũ thì ghi rõ đây là ước lượng hồi tưởng. | `[giờ công/tháng; actual hay estimate]` |
| Mức độ truy vết | Chọn một mẫu cố định từ các dòng workbook; đếm dòng có thể xác định rõ mục đích, hạng mục và người nhận/người hưởng từ tài liệu hiện có. Không đưa chi tiết từng dòng vào bản trình bày. | `[số dòng truy vết được / tổng mẫu]` |
| Mức độ đầy đủ đầu vào | Trong cùng mẫu, đếm các khoản có thông tin cần thiết và chứng từ/refererence đối chiếu được; ghi riêng loại thông tin thường thiếu. | `[số đủ / tổng mẫu; nhóm thiếu phổ biến]` |
| Chênh lệch đối soát | Nếu workbook có đủ tổng theo dòng và tổng theo nhóm/phương thức, đối chiếu hai cách tính trên cùng tháng và ghi tổng số lần/số chênh đã được Kế toán xác nhận. | `[số lần lệch hoặc “không đo được”]` |

Không lấy dữ liệu người nhận hoặc description thật làm ví dụ trong bản lưu. Chỉ dùng số liệu tổng hợp, đã kiểm tra và không thể nhận diện một phiếu/người cụ thể.

### Pilot sau khi quy trình được triển khai

Lặp lại **cùng định nghĩa chỉ số và cùng cách lấy mẫu** trong một tháng pilot. Ghi lại:

- Ngày/giờ khi tổng theo hạng mục có thể xem được sau lượt chạy thành công.
- Thời gian thực tế dành cho đối chiếu thủ công (nếu vẫn có); không ghi 0 nếu chưa đo.
- Số phiếu trong mẫu có mục đích, hạng mục, người nhận/người hưởng và chứng từ đủ rõ.
- Số lần cần hỏi lại hoặc sửa field trước khi thanh toán; chỉ tính nếu nhóm bắt đầu ghi nhận.
- Chênh lệch giữa card tổng và phép đối chiếu độc lập của Kế toán; mục tiêu là ghi nhận chính xác, không giả định trước là bằng 0.

### Bảng điền số liệu trước khi trình bày

| Chỉ số | Baseline (2–3 tháng) | Pilot (1 tháng) | Nguồn/ghi chú |
| --- | --- | --- | --- |
| Thời gian có breakdown hạng mục | `[điền]` | `[điền sau pilot]` | `[nguồn xác nhận]` |
| Giờ công tổng hợp/đối chiếu | `[điền; ghi rõ estimate nếu hồi tưởng]` | `[điền sau khi đo]` | `[ai ghi, cách ghi]` |
| Mẫu có mục đích + hạng mục + người nhận rõ | `[n/N]` | `[n/N]` | `[cùng cỡ mẫu/cách chọn]` |
| Mẫu đủ reference/chứng từ | `[n/N]` | `[n/N]` | `[không lưu chứng từ trong slide]` |
| Chênh lệch đối soát đã xác nhận | `[điền hoặc chưa đo]` | `[điền sau pilot]` | `[người xác nhận]` |

So sánh phải cùng kỳ/cỡ mẫu và định nghĩa; không nói “giảm X%” nếu chưa có số đo tin cậy. Các giá trị ở bảng trên đều là placeholder, không phải kết quả thực tế.

## Ví dụ minh họa cần chuẩn bị

Chọn **một trường hợp đã khử danh tính** từ workbook, chỉ sau khi người phụ trách cho phép đưa ví dụ vào buổi trình bày:

1. Tìm một khoản mà mô tả cũ chưa cho biết rõ mục đích hoặc người nhận/người hưởng.
2. Không trích nguyên văn tên, description, số chứng từ, tài khoản hoặc dữ liệu nhận diện.
3. Mô tả dạng tổng quát: **Trước:** “chi phí chung chung, khó biết phục vụ việc gì/cho ai”; **Sau:** mục đích cụ thể, người nhận theo quy ước, hạng mục phù hợp, số tiền/phương thức trong field và chứng từ tham chiếu.
4. Nếu muốn dùng số liệu, chỉ đưa aggregate đã được Kế toán xác nhận và thay các placeholder như `[N dòng trong mẫu]`, `[X dòng truy vết được]`, `[Y ngày chờ breakdown]`.
5. Không dùng ảnh chụp card thật trong deck nếu còn thấy số tiền, tên hạng mục, người, vendor hoặc nội dung phiếu; nên dựng lại ví dụ giả lập.

## Phần cảm nhận cá nhân — để người trình bày tự bổ sung

Không viết thay cảm nhận của người dùng. Sau pilot, có thể trả lời ngắn các câu hỏi:

- Trước AP Process, phần nào khiến mình mất công hoặc thiếu yên tâm nhất?
- Sau khi thử quy trình, điều gì thay đổi rõ nhất trong cách tạo, duyệt hoặc truy lại phiếu?
- Mình tin tưởng đến đâu vào số tổng theo phương thức/hạng mục, và đã đối chiếu điều gì?
- Điều gì vẫn chưa tốt hoặc cần thay đổi trước khi áp dụng rộng hơn?
- Trong ngắn hạn và dài hạn, giá trị lớn nhất đối với nhóm là gì?

## Câu kết gợi ý

“AP Process không thay con người quyết định khoản chi có hợp lý hay không. Quy trình giúp chúng ta ghi rõ lý do, review đúng vai trò, xác nhận khoản đã trả và nhìn được số tổng theo tháng/hạng mục từ các phiếu nguồn. Giá trị của nó phụ thuộc vào chất lượng thông tin mỗi người nhập và việc cả nhóm thực hiện đúng các bước bàn giao.”

## Trước khi chốt nội dung

- Điền baseline từ workbook và đánh dấu rõ số nào là đo được, số nào là estimate.
- Chỉ đưa dữ liệu aggregate đã được Kế toán xác nhận; không lưu dữ liệu giao dịch thật trong repo.
- Bổ sung cảm nhận cá nhân sau khi có trải nghiệm pilot đủ tin cậy.
- Xác nhận đây vẫn là buổi giới thiệu/thống nhất áp dụng 8–10 phút, không phải báo cáo ROI đã đo.
- Chốt với nhóm cách ghi người nhận/người hưởng khoản chi; nội dung này chưa phải field có cấu trúc trong phiên bản hiện tại.

**Tài liệu liên quan:** hướng dẫn board ở [ap-process-board-user-guide.md](./ap-process-board-user-guide.md), slide import Google Slides ở [ap-process-presentation.pptx](./ap-process-presentation.pptx). Chưa tạo script thuyết trình riêng vì người trình bày dự định dùng nội dung file này; chỉ bổ sung nếu được yêu cầu.
