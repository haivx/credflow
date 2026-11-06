# 0011 · Config rule theo khách hàng, chấm theo mọi khách của staff

Trạng thái: Đã chốt · Ngày: 2026-11-06 · Plan: `docs/plans/25-config-theo-khach-hang.md`

## Bối cảnh

Mỗi khách hàng chấp nhận tổ chức cấp khác nhau và đọc ngày khác nhau (khách ở Mỹ đọc `3/9/2026` là 9 tháng 3). Staff có thể làm cho nhiều khách hàng (`staff.clientIds`), còn document không ghi khách hàng nào.

## Quyết định (Liam duyệt qua plan 25)

- Config: `config/rules/default.yaml` + `config/rules/clients/<clientId>.yaml`, viết đầy đủ (không gộp ngầm với default), mỗi file có `name` riêng. Nạp và validate hết lúc khởi động; file nào sai thì không khởi động.
- Một giấy được chấm theo config của **mọi** khách hàng của staff (`configsFor`), gộp chặt nhất (`evaluateRulesForConfigs`): rule chỉ qua khi qua ở mọi config; message của rule không qua có tiền tố tên config. Staff không có khách hàng, hoặc khách hàng chưa có file → `default`.
- `RulesConfig.dateOrder`: `strict` (mặc định, ngày số D/M ≤ 12 là mơ hồ), `MDY`, `DMY` (đọc theo thứ tự đó và kiểm ngày LLM điền khớp chữ in).
- `versions.rules` = `tên@version` của các config đã dùng, sắp theo tên, nối bằng `+`.

## Phương án đã loại

- **`clientId` trên document do staff chọn lúc upload:** chính xác hơn nhưng phải đổi contract, DB, màn upload; chọn sai thì có thể tự duyệt theo config lỏng hơn.
- **Config khách hàng chỉ ghi phần khác default:** ngắn hơn nhưng có luật gộp ngầm (mảng ghi đè hay nối?), khó review.

## Hệ quả

- Không bao giờ tự duyệt theo config lỏng của một khách hàng khi khách hàng khác của cùng staff không chấp nhận.
- Staff làm cho khách `MDY` và khách `DMY` cùng lúc: ngày D/M ≤ 12 luôn bị một bên chặn → luôn chuyển người duyệt.
- `name`, `dateOrder` có giá trị mặc định trong contract để config viết trong test cũ vẫn chạy; yêu cầu "file khách hàng phải có `name` riêng" do bộ nạp kiểm.
