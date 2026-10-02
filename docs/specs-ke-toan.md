# Quy trình theo dõi tiền đã chi trên Trello

**Bản mô tả để Kế toán và Giám đốc xem lại các bổ sung về bàn giao phiếu, lưu trữ và cảnh báo trước khi đưa vào sử dụng.** Chức năng dưới đây chưa được triển khai.

## Kế toán sẽ xem được gì?

Trên thẻ **Tổng chi trong tháng**, Kế toán xem được tháng báo cáo, thời gian cập nhật và ba số tiền:

- **Tổng chi trong tháng:** tổng tiền đã thanh toán trong tháng đang xem.
- **Chi tiền mặt trong tháng:** phần đã trả bằng tiền mặt.
- **Chi chuyển khoản trong tháng:** phần đã trả bằng chuyển khoản.

**Tổng chi trong tháng = Chi tiền mặt trong tháng + Chi chuyển khoản trong tháng.** Ví dụ một phiếu đã trả 2.000.000 VND tiền mặt và một phiếu đã chuyển khoản 3.000.000 VND trong cùng tháng thì ba số lần lượt là **5.000.000**, **2.000.000** và **3.000.000 VND**. Đây là **tiền đã chi**, không phải số tiền mặt còn trong quỹ hay số dư tài khoản ngân hàng.

## Ai thực hiện việc gì?

| Người thực hiện | Trách nhiệm |
| --- | --- |
| Người đề nghị chi | Tạo phiếu tại **Draft**, gắn **chính mình làm người phụ trách (assignee)**, nhập tiêu đề, số tiền VND, loại chi phí, hình thức thanh toán trong Amazing Fields; ghi lý do và đính kèm chứng từ. **Để trống Ngày thanh toán.** Khi chuyển sang **Requesting**, thêm Giám đốc làm người phụ trách và **bình luận @nhắc tên Giám đốc** để báo cần duyệt. |
| Giám đốc | Xem xét phiếu ở Requesting. Khi duyệt và chuyển sang **Approved**, thêm Kế toán làm người phụ trách và **bình luận @nhắc tên Kế toán** để báo cần kiểm tra/thanh toán. |
| Kế toán | Kiểm tra thông tin và chứng từ ở Approved, xác nhận số tiền/hình thức thực tế và duyệt lần hai. Sau khi trả tiền, **chính Kế toán nhập Ngày thanh toán (cả ngày và giờ thực tế)** trong Amazing Fields; kiểm tra đã lưu đúng rồi **mới chuyển sang Paid**. **Bình luận xác nhận đã thanh toán, ngày/giờ và hình thức** khi chuyển cột. |
| Hệ thống | Đọc các phiếu Paid, cộng tiền theo tháng và hình thức thanh toán, cập nhật ba số trên thẻ Tổng chi trong tháng. Hệ thống không tự duyệt, chuyển phiếu hay sửa phiếu chi. |
| Người phụ trách vận hành | Nhận cảnh báo Telegram có **link phiếu và tên ô thiếu/sai** nếu phiếu Paid bị lỗi; mở phiếu, báo người phụ trách/Kế toán sửa rồi cập nhật lại. |

**Draft → Requesting → Approved → Paid** là đường đi của phiếu. **Mỗi lần chuyển cột phải để lại một bình luận nêu việc vừa làm và lý do/trạng thái**; nếu có người xử lý tiếp thì nhắc tên và gắn họ làm người phụ trách. Trello lưu ai bình luận và lúc nào; khi chuyển ngược để sửa cũng phải bình luận. Chỉ phiếu thực sự trả tiền mới vào Paid; phiếu Approved **chưa** được tính. Phiếu chưa chi mà không tiếp tục thì **chuyển từ Draft/Requesting/Approved sang Discard**, bình luận lý do hủy và nhắc người liên quan. **Nếu muốn lưu trữ phiếu chưa chi, phải chuyển sang Discard và bình luận trước khi bấm Lưu trữ.** Muốn dùng lại thì khôi phục về Draft/Requesting và duyệt lại. **Phiếu đã Paid phải giữ ở Paid: không chuyển Discard, không lưu trữ và không xóa**, vì làm vậy sẽ mất khoản chi khỏi các lần tính lại.

**Quy tắc “chỉ Kế toán nhập Ngày thanh toán”, gắn người phụ trách và bình luận mỗi lần chuyển cột là trách nhiệm của nhóm, không phải khóa kỹ thuật trên Trello Free.** Gói đang dùng không bảo đảm chặn người khác sửa field, kéo phiếu sang Paid hay tự buộc điền đủ ô/bình luận. Hai vòng duyệt, đặc biệt bước Kế toán kiểm tra trước Paid, giúp bảo đảm thông tin đúng. Nếu cần đối chiếu ai đã sửa, xem lịch sử hoạt động của Trello và Amazing Fields.

## Cách ghi phiếu để tính đúng

Mỗi phiếu Paid là **một lần thanh toán** bằng **một** hình thức Tiền mặt hoặc Chuyển khoản. Người đề nghị nhập **Tiêu đề**, **Số tiền**, **Loại chi phí**, **Hình thức thanh toán** ngay khi tạo theo quy trình; Ngày thanh toán **để trống**. Kế toán có thể sửa số tiền/hình thức nếu thực tế khác đề nghị; sau khi đã chi, Kế toán nhập ngày **và giờ** thực chi rồi mới chuyển Paid. Đơn vị tiền tệ hiển thị trong Amazing Fields là **VND**.

Nếu một khoản chi trả nhiều đợt, **mỗi đợt là một phiếu riêng**. Có thể dán link các phiếu liên quan vào nhau để dễ đối chiếu; mỗi đợt đã trả vẫn được cộng theo số tiền trên phiếu của đợt đó. Mô tả và tệp đính kèm để giải thích khoản chi và lưu chứng từ, **không** thay thế số tiền/ngày/hình thức trong Amazing Fields. Người tạo phiếu có thể được tìm trong lịch sử thẻ; avatar trên thẻ có thể là người được giao việc, không nhất thiết là người tạo.

## Hệ thống tính và cập nhật khi nào?

Mỗi lần cập nhật, hệ thống đọc lại **tất cả phiếu ở Paid**; phiếu ở Draft, Requesting, Approved hoặc Discard không được tính. Phiếu thuộc tháng nào được quyết định bằng **Ngày thanh toán thực tế theo giờ Việt Nam**, không dựa vào ngày tạo phiếu hoặc ngày chuyển cột. Chẳng hạn trả lúc 23:59 ngày 30/09 thì tính tháng 9; trả lúc 00:00 ngày 01/10 thì tính tháng 10. Phiếu đã thanh toán vào tháng trước **không** cộng vào ba số của tháng hiện tại.

Hệ thống tính lại từ các phiếu Paid mỗi lần chạy, **không cộng chồng lên kết quả cũ**. Bấm cập nhật hai lần không làm chi phí tăng gấp đôi. Nếu Kế toán sửa một phiếu Paid, lần cập nhật sau ba số sẽ phản ánh giá trị mới. **Giữ mọi phiếu đã chi ở Paid lâu dài** để có đủ dữ liệu đối chiếu và tính lịch sử; nếu vô tình lưu trữ phiếu vẫn nằm trong Paid thì hệ thống báo lỗi, không lặng lẽ tính thiếu.

Dự kiến có một lượt cập nhật tự động **mỗi ngày lúc 19:00 giờ Việt Nam**; khi cần xem ngay có thể bấm nút **Cập nhật tổng chi tháng** trên Trello. Nút không hiện hộp xác nhận: **sau một lần cập nhật thành công, bấm lại trong 60 giây sẽ nhận thông báo phải chờ**, không chạy lại; nếu lần trước lỗi, sau khi sửa có thể bấm lại ngay. Lịch tự động vẫn chạy độc lập, không bị thời gian chờ của nút ảnh hưởng; hai lượt không chạy chồng lên nhau. **Luôn xem “Tháng báo cáo” và “Cập nhật”** trước khi dùng số liệu: trong ngày đầu tháng, card có thể còn hiện số của tháng trước cho đến khi chạy lần đầu của tháng mới.

Nếu một phiếu Paid thiếu tiêu đề, số tiền, loại chi phí, hình thức hoặc Ngày thanh toán, nhập sai dạng hoặc giá trị không hợp lệ, **toàn bộ lần cập nhật dừng**: hệ thống trả lỗi chỉ rõ phiếu và ô cần kiểm tra, đồng thời gửi **một tin Telegram có link mở từng phiếu lỗi, tên ô thiếu/sai và lý do** cho người phụ trách vận hành. Tin **không chứa số tiền, giá trị đã nhập, nội dung phiếu, chứng từ hay mật khẩu**; nhóm nhận tin phải gồm người được quyền xem phiếu. Người vận hành mở đúng link, báo người làm phiếu hoặc Kế toán sửa; với ô Ngày thanh toán thì **Kế toán là người nhập/sửa**. Sau đó chạy lại.

Khi có lỗi, **không ghi ba số mới**; card có thể còn hiển thị kết quả của lần cập nhật thành công trước đó, nên phải kiểm tra tháng và giờ cập nhật trước khi dùng. Nếu Telegram không gửi được, lần chạy vẫn báo lỗi và có thêm cảnh báo dự phòng từ lịch chạy tự động; **không coi là đã thông báo thành công**. Chủ board sẽ điền thông tin bot và nơi nhận tin Telegram vào cấu hình riêng, không ghi vào thẻ hoặc tài liệu. Nếu tháng này chưa có phiếu chi, chỉ **sau khi chạy thành công** hệ thống mới hiển thị ba số **0 VND**; các ô đang để trống không có nghĩa là 0.

## Mỗi tháng có cần tạo một thẻ kết quả mới không?

**Không.** Chỉ dùng **một thẻ Tổng chi trong tháng** để xem tháng hiện tại; khi sang tháng mới, hệ thống cập nhật tháng và ba số trên **chính thẻ đó**. Các phiếu Paid là nơi giữ thông tin chi của từng tháng, không phải thẻ tổng. Nếu cần xem lại tháng cũ, phải đọc và cộng lại các phiếu Paid có Ngày thanh toán trong tháng đó. Nếu sửa một phiếu cũ, số được tính lại cho tháng cũ cũng thay đổi; chức năng này **không lập bản chốt sổ tháng cố định**.

**Biểu đồ theo Loại chi phí là giai đoạn sau:** một trang báo cáo riêng có thể đọc các phiếu Paid, nhóm theo **tháng thanh toán** và **Loại chi phí** để so sánh các tháng. Trang đó sẽ đọc dữ liệu của từng phiếu, **không** đọc lịch sử từ thẻ Tổng chi trong tháng vì thẻ này chỉ hiện tháng hiện tại. Chức năng biểu đồ chưa nằm trong phần triển khai này.

Các chi tiết dành cho người triển khai nằm trong [đặc tả kỹ thuật](./specs.md).
