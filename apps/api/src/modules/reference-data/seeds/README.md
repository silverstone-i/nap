# Reference snapshot 2026-09-12

Countries: [ISO 3166 source at 17b964b](https://github.com/wooorm/iso-3166/blob/17b964b1cb469c170e5f1a0f6e18c951e2b17244/1.js) (MIT; license included).
Currencies: [Currency codes at ab9b0ae](https://github.com/datasets/currency-codes/blob/ab9b0ae88e8bffd4ac1c468ce9c784738d3376ba/data/codes-all.csv)
(ODC-PDDL-1.0; upstream datapackage provenance included). Currency source is SIX
Interbank Clearing on behalf of ISO. Only rows without withdrawal dates are used;
duplicate country/currency pairs are collapsed by currency code. Numeric codes
retain leading zeroes. Undefined minor units are null.

Retrieved 2026-09-12. This snapshot is committed, not fetched by setup. Updating it
requires review of the source changes, license evidence, and seed version.

## Download checksums (SHA-256)

- `nap-countries.js`: `03fb12d2b9c5e61f99679db75bf5a6c289512bcdf3a9f1b59ea3dcdfe2b4f294`
- `nap-currencies.csv`: `c4b6829a966f0564e77dc6c2d100d268cce61b30f7637bf3d5ec626b0393407f`

Verified 2026-09-15: downloads at these commits match both recorded SHA-256
checksums. The committed datasets and license evidence were not changed.
