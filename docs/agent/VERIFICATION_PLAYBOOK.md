# Sổ tay kiểm chứng (dùng cho mọi dự án)

> Một cách nghĩ về kiểm chứng khi làm việc với AI agent, dùng lại được.
> Chép file này vào dự án mới, rồi làm các bước "Khởi tạo" để áp vào cụ thể.

## Tư duy trong năm câu

1. **Kiểm chứng là agent quan sát hệ thống thật, không phải agent suy luận về code.**
2. **Niềm tin có được nhờ bằng chứng, và quyền tự chủ chỉ được trao nhanh bằng tốc độ niềm tin tăng.**
3. **Mỗi lần kiểm bằng tay là một script đang chờ được viết.**
4. **Mỗi lần phải sửa cùng một lỗi hai lần là một rule cứng đang chờ được viết.**
5. **Người duyệt ý định (plan) và xem ngẫu nhiên bằng chứng, không đọc từng dòng code.**

## Năm câu hỏi (áp cho mọi app)

Với bất kỳ dự án nào, trả lời các câu này trước khi viết verify skill. Câu trả lời *chính là* skill.

| # | Câu hỏi | Trở thành |
|---|---|---|
| 1 | Người dùng tới hệ thống bằng cách nào? (browser, API, CLI, mobile, queue, cron) | Lớp **Điều khiển** |
| 2 | Khởi động nó y hệt mọi lần bằng cách nào, và làm sao biết nó đã sẵn sàng? | Script `up` + readiness check |
| 3 | Một kịch bản cần trạng thái gì, và tạo trạng thái đó từ con số không thế nào? | Kịch bản `seed` + fixture |
| 4 | *Nhìn* thấy chuyện đã xảy ra ở đâu? (response, DOM, screenshot, log, DB, event) | Lớp **Quan sát** |
| 5 | Người dùng gọi thế nào là "chạy được"? Điều gì không bao giờ được xảy ra? | Kết quả kỳ vọng + bất biến |

Chưa trả lời được câu 2 hoặc 3 thì sửa cái đó trước. Một app không khởi động và seed
lại được y hệt thì không ai kiểm chứng được, dù là người hay agent.

## Điều khiển & quan sát theo loại app

| Loại app | Điều khiển bằng | Quan sát qua |
|---|---|---|
| Web app | Playwright / CDP | screenshot, DOM, lỗi console, network |
| HTTP API / backend | curl / script HTTP client | status, body, trạng thái DB, log |
| Pipeline dữ liệu / LLM | chạy từng bước trên fixture | validate schema, trường chính, bất biến |
| CLI tool | chạy với tham số | exit code, stdout/stderr, file đã ghi |
| Mobile | simulator + tự động hoá | screenshot, log |
| Background job | đẩy job + chờ | trạng thái job, tác dụng phụ, log |
| Electron / desktop | CDP vào renderer | như web + log của main process |

## Các mức kiểm chứng (chọn mức rẻ nhất chứng minh được thay đổi)

- **L0 static:** type, lint, boundary. Luôn chạy, tự động (hook + CI).
- **L1 unit:** chỉ logic thuần.
- **L2 integration:** process thật, DB thật, lời gọi thật. Mặc định cho thay đổi hành vi.
- **L3 end-to-end:** qua giao diện người dùng thật.
- **L4 non-functional:** perf, load. Chỉ khi đó là mục tiêu.

Rule: mọi thay đổi hành vi cần ít nhất một thứ ở **L2 trở lên**.

## Vòng lặp cho mỗi task

1. **Plan** có verification plan: mức rủi ro, hành vi kỳ vọng, kịch bản, các mức kiểm.
2. **Bug?** Tái hiện trước (đỏ). Không tái hiện được → không sửa, báo lại.
3. **Code.**
4. **Kiểm chứng** bằng script, không ứng biến. Cùng bước tái hiện phải chuyển xanh.
5. **Báo bằng chứng:** lệnh, output đã cắt gọn, screenshot, những gì *không* kiểm được.
6. **Thu hoạch:** chỗ nào phải ứng biến → script mới. Chỗ nào bị chỉnh lại → thêm vào Watchlist của guardrail.

## Khởi tạo trong dự án mới (theo thứ tự)

1. Viết câu trả lời cho năm câu hỏi (nửa trang).
2. Script `up` có readiness check và timeout.
3. `seed` với một kịch bản và 2–3 fixture giả lập.
4. Một script điều khiển/quan sát cho giao diện chính, output JSON.
5. Feature map cho 3–5 luồng quan trọng nhất.
6. Verify skill (quy trình + rule) trỏ tới các thứ trên.
7. Hook L0 trong vòng làm việc của agent (typecheck/lint sau mỗi lần sửa).
8. **Cài sẵn một bug**, đưa agent một báo lỗi mơ hồ, xem nó có tìm ra bug qua skill không.
   Đây là eval đầu tiên. Lặp lại tới khi nó tìm ra.
9. Bắt đầu file guardrails. Nâng rule thành rule cứng khi lỗi lặp lại.

Không cần dựng mọi thứ ngay ngày đầu. Bước 1–4 + 8 đã đủ đưa bạn lên một bậc.

## Mức rủi ro (quyết định người cần để ý đến đâu)

- **Thấp:** đảo ngược được, tách biệt, người dùng không thấy hoặc chỉ là giao diện → bằng chứng, người xem ngẫu nhiên.
- **Bình thường:** tính năng, đổi API → plan đã duyệt + bằng chứng đã được xem.
- **Cao / cửa một chiều:** migration dữ liệu, auth, tiền, dữ liệu cá nhân/y tế, xoá dữ liệu,
  tác dụng ra bên ngoài (email, thanh toán) → người xem kiểm chứng ít nhất một lần.

Lĩnh vực càng nhiều cửa một chiều thì càng ở bậc thấp trên thang. Như vậy là đúng,
không phải thất bại.

## Thang tin cậy

1. Người xem mọi bước.
2. Người duyệt plan + verification plan; agent nộp bằng chứng.
3. Việc mức thấp bỏ qua duyệt plan; người xem ngẫu nhiên báo cáo.
4. Việc mức thấp tự merge khi CI xanh + verify đạt.
5. Agent tự nhận việc từ tín hiệu (báo lỗi, monitor) và tự chạy vòng lặp.

Leo từng bậc một, chỉ sau khi bậc hiện tại đã đứng vững qua các lần kiểm ngẫu nhiên.

## Dấu hiệu kiểm chứng đang yếu

- Agent nói "chắc chạy được" / "cái này sửa được lỗi" mà không có output lệnh nào.
- Test viết sau code và chưa bao giờ thấy đỏ.
- Mock assert vào mock.
- Bạn (người) đang copy screenshot hay lỗi dán vào chat → bạn mới là người kiểm chứng.
- Cùng một comment review xuất hiện ở hai thay đổi khác nhau.
- Các bước kiểm chứng mỗi phiên một khác (agent ứng biến).
- Tính năng LLM được "kiểm" bằng cách nhìn qua một output.
