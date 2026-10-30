-- 005_section_header_image: one optional header image per section (ARCHITECTURE §5, M11)

ALTER TABLE nodes ADD COLUMN header_asset_id TEXT REFERENCES assets(id);
