import type { StaffProfile } from "@credflow/contracts";

// Staff giả lập (docs/data-policy.md): tên và khách hàng đều hư cấu.
// Id cố định để `make db-seed` chạy lại không sinh dòng trùng.

const CLIENT_SUNRISE = "01M6CRWH00M3S97971WJSR6NX9"; // Sunrise Home Care (hư cấu)
const CLIENT_BAYLEAF = "01M6CRWH00M3S97971WJSR6NXA"; // Bayleaf Behavioral (hư cấu)

export const seedStaff: StaffProfile[] = [
  {
    id: "01M6CRWH00M3S97971WJSR6NWZ",
    legalName: "Maren Ostrowe",
    aliases: [],
    role: "caregiver",
    clientIds: [CLIENT_SUNRISE],
    region: "CA",
  },
  {
    // Đổi họ sau khi kết hôn: giấy cũ còn tên trước.
    id: "01M6CRWH00M3S97971WJSR6NX0",
    legalName: "Talia Brennick-Voss",
    aliases: ["Talia Brennick"],
    role: "caregiver",
    clientIds: [CLIENT_SUNRISE],
    region: "CA",
  },
  {
    // Tên thường gọi khác tên pháp lý.
    id: "01M6CRWH00M3S97971WJSR6NX1",
    legalName: "Jonathan Elsworth Pike",
    aliases: ["Jon Pike"],
    role: "behavior_technician",
    clientIds: [CLIENT_BAYLEAF],
    region: "CA",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NX2",
    legalName: "Priya Venkataraman-Holt",
    aliases: [],
    role: "behavior_technician",
    clientIds: [CLIENT_BAYLEAF],
    region: "WA",
  },
  {
    // Làm cho cả hai khách hàng.
    id: "01M6CRWH00M3S97971WJSR6NX3",
    legalName: "Dmitri Kalvane",
    aliases: [],
    role: "caregiver",
    clientIds: [CLIENT_SUNRISE, CLIENT_BAYLEAF],
    region: "WA",
  },
  {
    // Tên Việt: giấy có thể in họ trước hoặc sau.
    id: "01M6CRWH00M3S97971WJSR6NX4",
    legalName: "Nguyen Thi Lan Anh",
    aliases: ["Lan Anh Nguyen"],
    role: "caregiver",
    clientIds: [CLIENT_SUNRISE],
    region: "CA",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NX5",
    legalName: "Rosalind Achterberg",
    aliases: ["Roz Achterberg"],
    role: "behavior_technician",
    clientIds: [CLIENT_BAYLEAF],
    region: "OR",
  },
  {
    // Có hậu tố "Jr.", ca khó khi so khớp tên.
    id: "01M6CRWH00M3S97971WJSR6NX6",
    legalName: "Marcus Delacroix Jr.",
    aliases: ["Marcus Delacroix"],
    role: "caregiver",
    clientIds: [CLIENT_SUNRISE],
    region: "OR",
  },
  {
    // Chưa gán khách hàng nào.
    id: "01M6CRWH00M3S97971WJSR6NX7",
    legalName: "Elif Saranova",
    aliases: [],
    role: "caregiver",
    clientIds: [],
    region: "CA",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NX8",
    legalName: "Ignatius Fairbourne",
    aliases: [],
    role: "behavior_technician",
    clientIds: [CLIENT_BAYLEAF],
    region: "WA",
  },
];
