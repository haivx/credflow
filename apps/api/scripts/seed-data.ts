import type { StaffProfile, UserRole } from "@credflow/contracts";

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
  // Plan 16: chủ thẻ trên fixture CPR (eval/hard-cases/cpr), để chạy end-to-end đúng người.
  {
    id: "01M6CRWH00M3S97971WJSR6NXB",
    legalName: "Marisol Quennell",
    aliases: [],
    role: "caregiver",
    clientIds: [CLIENT_SUNRISE],
    region: "CA",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NXC",
    legalName: "Tobias Arkwright-Lenz",
    aliases: [],
    role: "caregiver",
    clientIds: [CLIENT_SUNRISE],
    region: "CA",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NXD",
    legalName: "Odalys Venn",
    aliases: [],
    role: "behavior_technician",
    clientIds: [CLIENT_BAYLEAF],
    region: "WA",
  },
];

/**
 * Mật khẩu dev chung cho mọi user giả lập (ADR 0004). Chỉ dùng trên máy dev và demo dữ liệu giả lập;
 * deploy demo (P6) phải đổi qua env.
 */
export const SEED_PASSWORD = "credflow-dev";

interface SeedUser {
  id: string;
  email: string;
  role: UserRole;
  staffId: string | null;
}

// Mỗi vai trò một user. User staff gắn với staff seed đầu tiên (Maren Ostrowe).
// Thêm một user staff cho mỗi chủ thẻ fixture CPR (plan 16): upload lấy staffId từ session.
export const seedUsers: SeedUser[] = [
  {
    id: "01M6CRWH00M3S97971WJSR6NY0",
    email: "staff@example.test",
    role: "staff",
    staffId: "01M6CRWH00M3S97971WJSR6NWZ",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NY1",
    email: "reviewer@example.test",
    role: "reviewer",
    staffId: null,
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NY2",
    email: "admin@example.test",
    role: "admin",
    staffId: null,
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NY3",
    email: "staff-marisol@example.test",
    role: "staff",
    staffId: "01M6CRWH00M3S97971WJSR6NXB",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NY4",
    email: "staff-tobias@example.test",
    role: "staff",
    staffId: "01M6CRWH00M3S97971WJSR6NXC",
  },
  {
    id: "01M6CRWH00M3S97971WJSR6NY5",
    email: "staff-odalys@example.test",
    role: "staff",
    staffId: "01M6CRWH00M3S97971WJSR6NXD",
  },
];
