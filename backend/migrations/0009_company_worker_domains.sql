ALTER TABLE stores ADD COLUMN worker_service TEXT;
ALTER TABLE stores ADD COLUMN worker_domain_id TEXT;

CREATE UNIQUE INDEX stores_worker_domain_id_idx
ON stores(worker_domain_id)
WHERE worker_domain_id IS NOT NULL;
