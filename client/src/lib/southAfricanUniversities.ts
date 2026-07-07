// The 26 public universities in South Africa (traditional, comprehensive, and
// universities of technology), plus an escape hatch for anything else a
// provider might need to reconcile against (TVET colleges, private
// institutions, funders). Update if new public universities are established.
export const SOUTH_AFRICAN_UNIVERSITIES = [
  "University of Cape Town",
  "Stellenbosch University",
  "University of the Witwatersrand",
  "University of Pretoria",
  "University of KwaZulu-Natal",
  "Rhodes University",
  "University of the Free State",
  "North-West University",
  "University of the Western Cape",
  "University of Fort Hare",
  "University of Limpopo",
  "University of South Africa",
  "University of Johannesburg",
  "Nelson Mandela University",
  "University of Zululand",
  "Walter Sisulu University",
  "University of Venda",
  "Tshwane University of Technology",
  "Cape Peninsula University of Technology",
  "Durban University of Technology",
  "Vaal University of Technology",
  "Central University of Technology",
  "Mangosuthu University of Technology",
  "Sol Plaatje University",
  "University of Mpumalanga",
  "Sefako Makgatho Health Sciences University",
] as const;

export const OTHER_INSTITUTION_OPTION = "Other (not a public university)";
