CREATE OR REPLACE VIEW tenantid.vw_embedding_matches_human AS
SELECT
  vs.vendor_sku,
  vs.description AS vendor_description,
  cs.catalog_sku,
  cs.description AS catalog_description,
  em.confidence,
  em.vendor_embedding_id,
  em.catalog_embedding_id,
  em.model,
  em.input_type
FROM tenantid.embedding_matches em
JOIN tenantid.embedding_skus ev ON em.vendor_embedding_id = ev.id
JOIN tenantid.vendor_skus vs ON ev.sku_id = vs.id
JOIN tenantid.embedding_skus ec ON em.catalog_embedding_id = ec.id
JOIN tenantid.catalog_skus cs ON ec.sku_id = cs.id;