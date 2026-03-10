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
 * Each entry: { code, label, placeholder? }
 */
export const TAX_TYPES = {
  US: [
    { code: 'EIN', label: 'Employer Identification Number (EIN)', placeholder: 'XX-XXXXXXX' },
    { code: 'SSN', label: 'Social Security Number (SSN)', placeholder: 'XXX-XX-XXXX' },
    { code: 'ITIN', label: 'Individual Taxpayer Identification Number (ITIN)', placeholder: '9XX-XX-XXXX' },
    { code: 'TIN', label: 'Taxpayer Identification Number (TIN)', placeholder: 'XX-XXXXXXX' },
  ],
  CA: [
    { code: 'BN', label: 'Business Number (BN)', placeholder: 'XXXXXXXXX RT XXXX' },
    { code: 'GST', label: 'GST/HST Registration Number', placeholder: 'XXXXXXXXX RT 0001' },
    { code: 'SIN', label: 'Social Insurance Number (SIN)', placeholder: 'XXX-XXX-XXX' },
  ],
  GB: [
    { code: 'VAT', label: 'VAT Registration Number', placeholder: 'GB XXXXXXXXX' },
    { code: 'UTR', label: 'Unique Taxpayer Reference (UTR)', placeholder: 'XXXXXXXXXX' },
    { code: 'NINO', label: 'National Insurance Number (NINO)', placeholder: 'AB XXXXXX C' },
  ],
  MX: [
    { code: 'RFC', label: 'Registro Federal de Contribuyentes (RFC)', placeholder: 'XXXX-XXXXXX-XXX' },
    { code: 'CURP', label: 'CURP', placeholder: 'XXXX-XXXXXX-XXXXXXXX' },
  ],
  BR: [
    { code: 'CNPJ', label: 'CNPJ', placeholder: 'XX.XXX.XXX/XXXX-XX' },
    { code: 'CPF', label: 'CPF', placeholder: 'XXX.XXX.XXX-XX' },
  ],
  IN: [
    { code: 'GSTIN', label: 'GST Identification Number (GSTIN)', placeholder: 'XX XXXXX XXXXX X XX X' },
    { code: 'PAN', label: 'Permanent Account Number (PAN)', placeholder: 'ABCDE1234F' },
    { code: 'TAN', label: 'Tax Deduction Account Number (TAN)', placeholder: 'ABCD12345E' },
  ],
  AU: [
    { code: 'ABN', label: 'Australian Business Number (ABN)', placeholder: 'XX XXX XXX XXX' },
    { code: 'TFN', label: 'Tax File Number (TFN)', placeholder: 'XXX XXX XXX' },
    { code: 'GST', label: 'GST Registration Number', placeholder: 'XX XXX XXX XXX' },
  ],
  DE: [
    { code: 'VAT', label: 'Umsatzsteuer-Identifikationsnummer (USt-IdNr)', placeholder: 'DE XXXXXXXXX' },
    { code: 'STID', label: 'Steuerliche Identifikationsnummer', placeholder: 'XXXXXXXXXXX' },
  ],
  FR: [
    { code: 'VAT', label: 'TVA Intracommunautaire', placeholder: 'FR XX XXXXXXXXX' },
    { code: 'SIREN', label: 'SIREN', placeholder: 'XXX XXX XXX' },
    { code: 'SIRET', label: 'SIRET', placeholder: 'XXX XXX XXX XXXXX' },
  ],
  ES: [
    { code: 'NIF', label: 'Numero de Identificacion Fiscal (NIF)', placeholder: 'XXXXXXXX X' },
    { code: 'CIF', label: 'Codigo de Identificacion Fiscal (CIF)', placeholder: 'X XXXXXXXX' },
    { code: 'VAT', label: 'IVA Number', placeholder: 'ES XXXXXXXXX' },
  ],
  _OTHER: [
    { code: 'VAT', label: 'VAT Number' },
    { code: 'TIN', label: 'Tax Identification Number (TIN)' },
    { code: 'OTHER', label: 'Other Tax Identifier' },
  ],
};

/** Flat list of all unique tax type codes */
export const ALL_TAX_TYPE_CODES = [...new Set(Object.values(TAX_TYPES).flat().map((t) => t.code))];
