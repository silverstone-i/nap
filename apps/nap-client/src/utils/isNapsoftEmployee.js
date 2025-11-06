const normalize = (value, fallback = '') => `${value ?? fallback}`.trim().toLowerCase();

export function isNapsoftEmployee(user) {
  if (!user) return false;

  const tenantCode = normalize(user.tenant_code);
  const tenantName = normalize(user.tenant);
  const company = normalize(user.company);
  const email = normalize(user.email);

  const napsoftTenantCode = normalize(import.meta.env.VITE_NAPSOFT_TENANT, 'NAP');
  const napsoftCompanyName = normalize(import.meta.env.VITE_NAPSOFT_COMPANY, 'NapSoft');
  const napsoftEmailDomain = normalize(import.meta.env.VITE_NAPSOFT_EMAIL_DOMAIN, 'napsoft.com');

  const emailMatchesDomain = napsoftEmailDomain && email.endsWith(`@${napsoftEmailDomain}`);

  return (
    (!!napsoftTenantCode && tenantCode === napsoftTenantCode) ||
    (!!napsoftCompanyName && tenantName === napsoftCompanyName) ||
    (!!napsoftCompanyName && company === napsoftCompanyName) ||
    emailMatchesDomain
  );
}
