-- Point Burger Tin defaults to the coherent commercial image set hosted by its storefront.
-- Existing user-uploaded images remain preserved and keep their normal override behavior.
UPDATE products
SET default_image = 'assets/menu-generated/' || id || '.webp',
    updated_at = CURRENT_TIMESTAMP
WHERE store_id = 'burger-tin';
