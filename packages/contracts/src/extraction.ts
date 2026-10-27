import * as z from "zod";
import { IsoDate } from "./common";
import { extractedField } from "./document";

// BẢN NHÁP: Liam chốt ở P0. Trường theo docs/doc-types.md.
// Ngày luôn chuẩn hoá về YYYY-MM-DD; chữ gốc nằm trong evidence.quote.

const Text = extractedField(z.string());
const Day = extractedField(IsoDate);

export const CprCardFields = z
  .object({
    holderName: Text,
    issuerName: Text,
    courseType: Text,
    completionDate: Day,
    /** Ngày hết hạn in trên thẻ, nếu có. */
    expirationDate: Day,
    /** Câu mô tả hiệu lực nếu không in ngày, ví dụ "Valid 2 years". Rule tự tính hạn. */
    validityText: Text,
    cardNumber: Text,
  })
  .meta({ id: "CprCardFields" });

export const ProfessionalLicenseFields = z
  .object({
    holderName: Text,
    issuerName: Text,
    licenseType: Text,
    licenseNumber: Text,
    issueDate: Day,
    expirationDate: Day,
  })
  .meta({ id: "ProfessionalLicenseFields" });

export const TbTestFields = z
  .object({
    holderName: Text,
    testType: extractedField(z.enum(["skin_test", "blood_test", "chest_xray"])),
    testDate: Day,
    /** Ngày đọc kết quả (skin test đọc sau 48–72 giờ). */
    readDate: Day,
    result: extractedField(z.enum(["negative", "positive", "indeterminate"])),
    clinicName: Text,
  })
  .meta({ id: "TbTestFields" });

export const BackgroundCheckFields = z
  .object({
    subjectName: Text,
    providerName: Text,
    completedDate: Day,
    result: extractedField(z.enum(["clear", "consider", "not_clear"])),
    referenceNumber: Text,
  })
  .meta({ id: "BackgroundCheckFields" });

export const VaccinationRecordFields = z
  .object({
    holderName: Text,
    vaccine: Text,
    /** Mũi liên quan nhất (mới nhất của đúng loại vaccine yêu cầu). */
    doseDate: Day,
    providerName: Text,
  })
  .meta({ id: "VaccinationRecordFields" });

/** Kết quả trích xuất, phân biệt theo loại giấy. */
export const Extraction = z
  .discriminatedUnion("docType", [
    z.object({ docType: z.literal("cpr_card"), fields: CprCardFields }),
    z.object({
      docType: z.literal("professional_license"),
      fields: ProfessionalLicenseFields,
    }),
    z.object({ docType: z.literal("tb_test"), fields: TbTestFields }),
    z.object({
      docType: z.literal("background_check"),
      fields: BackgroundCheckFields,
    }),
    z.object({
      docType: z.literal("vaccination_record"),
      fields: VaccinationRecordFields,
    }),
  ])
  .meta({ id: "Extraction" });
export type Extraction = z.infer<typeof Extraction>;
