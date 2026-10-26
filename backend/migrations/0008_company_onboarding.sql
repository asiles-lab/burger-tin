ALTER TABLE stores ADD COLUMN slug TEXT;
ALTER TABLE stores ADD COLUMN public_host TEXT;
ALTER TABLE stores ADD COLUMN setup_status TEXT NOT NULL DEFAULT 'preparacion';
ALTER TABLE stores ADD COLUMN route_status TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE stores ADD COLUMN dns_status TEXT NOT NULL DEFAULT 'pendiente';

UPDATE stores
SET slug = id,
    public_host = id || '.restia.net.ar',
    setup_status = 'activo',
    route_status = 'activo',
    dns_status = 'activo'
WHERE id = 'burger-tin';

CREATE UNIQUE INDEX stores_slug_idx ON stores(slug);
