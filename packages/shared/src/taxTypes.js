/**
 * @file Tax type constants — country-keyed map of tax identifier types
 * @module @nap/shared/taxTypes
 *
 * Drives UI dropdowns for tax type selection, filtered by country.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/**
 * Country-keyed map of tax identifier types.
 * Each entry: { code, label }
 */
export const TAX_TYPES = {
  US: [
    { code: 'EIN', label: 'Employer Identification Number (EIN)' },
    { code: 'SSN', label: 'Social Security Number (SSN)' },
    { code: 'ITIN', label: 'Individual Taxpayer Identification Number (ITIN)' },
    { code: 'TIN', label: 'Taxpayer Identification Number (TIN)' },
  ],
  CA: [
    { code: 'BN', label: 'Business Number (BN)' },
    { code: 'GST', label: 'GST/HST Registration Number' },
    { code: 'SIN', label: 'Social Insurance Number (SIN)' },
  ],
  GB: [
    { code: 'VAT', label: 'VAT Registration Number' },
    { code: 'UTR', label: 'Unique Taxpayer Reference (UTR)' },
    { code: 'NINO', label: 'National Insurance Number (NINO)' },
  ],
  MX: [
    { code: 'RFC', label: 'Registro Federal de Contribuyentes (RFC)' },
    { code: 'CURP', label: 'CURP' },
  ],
  BR: [
    { code: 'CNPJ', label: 'CNPJ' },
    { code: 'CPF', label: 'CPF' },
  ],
  IN: [
    { code: 'GSTIN', label: 'GST Identification Number (GSTIN)' },
    { code: 'PAN', label: 'Permanent Account Number (PAN)' },
    { code: 'TAN', label: 'Tax Deduction Account Number (TAN)' },
  ],
  AU: [
    { code: 'ABN', label: 'Australian Business Number (ABN)' },
    { code: 'TFN', label: 'Tax File Number (TFN)' },
    { code: 'GST', label: 'GST Registration Number' },
  ],
  DE: [
    { code: 'VAT', label: 'Umsatzsteuer-Identifikationsnummer (USt-IdNr)' },
    { code: 'STID', label: 'Steuerliche Identifikationsnummer' },
  ],
  FR: [
    { code: 'VAT', label: 'TVA Intracommunautaire' },
    { code: 'SIREN', label: 'SIREN' },
    { code: 'SIRET', label: 'SIRET' },
  ],
  ES: [
    { code: 'NIF', label: 'Numero de Identificacion Fiscal (NIF)' },
    { code: 'CIF', label: 'Codigo de Identificacion Fiscal (CIF)' },
    { code: 'VAT', label: 'IVA Number' },
  ],
  _OTHER: [
    { code: 'VAT', label: 'VAT Number' },
    { code: 'TIN', label: 'Tax Identification Number (TIN)' },
    { code: 'OTHER', label: 'Other Tax Identifier' },
  ],
};

/** Flat list of all unique tax type codes */
export const ALL_TAX_TYPE_CODES = [...new Set(Object.values(TAX_TYPES).flat().map((t) => t.code))];
