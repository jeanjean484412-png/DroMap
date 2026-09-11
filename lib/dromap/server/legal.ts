const CONTACT_EMAIL = "contact@dromap.fr";

type LegalIdentity = {
  brandName: string;
  legalName: string | null;
  legalForm: string | null;
  postalAddress: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  phone: string | null;
  contactEmail: string;
  mediatorName: string | null;
  mediatorAddress: string | null;
  mediatorUrl: string | null;
  missingRequiredFields: string[];
};

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getDromapLegalIdentity(): LegalIdentity {
  const legalName = env("DROMAP_LEGAL_NAME");
  const legalForm = env("DROMAP_LEGAL_FORM");
  const postalAddress = env("DROMAP_LEGAL_ADDRESS");
  const registrationNumber = env("DROMAP_LEGAL_REGISTRATION");
  const vatNumber = env("DROMAP_LEGAL_VAT_NUMBER");
  const phone = env("DROMAP_LEGAL_PHONE");
  const mediatorName = env("DROMAP_MEDIATOR_NAME");
  const mediatorAddress = env("DROMAP_MEDIATOR_ADDRESS");
  const mediatorUrl = env("DROMAP_MEDIATOR_URL");

  const requiredFields: Array<[string, string | null]> = [
    ["DROMAP_LEGAL_NAME", legalName],
    ["DROMAP_LEGAL_FORM", legalForm],
    ["DROMAP_LEGAL_ADDRESS", postalAddress],
    ["DROMAP_LEGAL_REGISTRATION", registrationNumber],
    ["DROMAP_LEGAL_PHONE", phone],
    ["DROMAP_MEDIATOR_NAME", mediatorName],
    ["DROMAP_MEDIATOR_ADDRESS", mediatorAddress],
    ["DROMAP_MEDIATOR_URL", mediatorUrl],
  ];
  const missingRequiredFields = requiredFields.flatMap(([name, value]) => (value ? [] : [name]));

  if (process.env.VERCEL_ENV === "production" && missingRequiredFields.length > 0) {
    throw new Error(
      `Configuration juridique DroMap incomplète en production : ${missingRequiredFields.join(", ")}`,
    );
  }

  return {
    brandName: "DroMap",
    legalName,
    legalForm,
    postalAddress,
    registrationNumber,
    vatNumber,
    phone,
    contactEmail: CONTACT_EMAIL,
    mediatorName,
    mediatorAddress,
    mediatorUrl,
    missingRequiredFields,
  };
}
