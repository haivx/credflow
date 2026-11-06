// Tên người và tổ chức hư cấu (docs/data-policy.md). Không thêm tên người thật hay tổ chức thật.

export const FIRST_NAMES = [
  "Corwin",
  "Elspeth",
  "Fenna",
  "Halvard",
  "Isolde",
  "Jorvik",
  "Kestrel",
  "Lunet",
  "Mireille",
  "Novak",
  "Orsolya",
  "Peregrine",
  "Quillon",
  "Rosalind",
  "Saoirse",
  "Tamsin",
  "Ulric",
  "Verity",
  "Wynona",
  "Yarrow",
] as const;

export const LAST_NAMES = [
  "Ashgrove",
  "Brightwater",
  "Calloway-Fenn",
  "Dunmore",
  "Everhart",
  "Fairweather",
  "Greystone",
  "Holloway",
  "Ironside",
  "Juniper",
  "Kettleby",
  "Larkspur",
  "Merriweather",
  "Northcott",
  "Oakhaven",
  "Pemberly",
  "Quarrington",
  "Ravensworth",
  "Stoneleigh",
  "Thistlewood",
] as const;

/** Tổ chức hư cấu không có trong `acceptedIssuers` của config mặc định. */
export const UNACCEPTED_ISSUERS = [
  "Harrowgate First Aid Academy",
  "Silverline Rescue Guild",
  "Coastal Pulse Training Co.",
  "Meadowbrook Lifesaving School",
] as const;

export const COURSES = [
  "Adult CPR and AED Provider",
  "Basic Life Support (BLS) Provider",
  "Heartsaver CPR AED",
  "Adult, Child and Infant CPR",
] as const;
