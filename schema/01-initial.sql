CREATE SCHEMA IF NOT EXISTS ffxiv;

CREATE TABLE IF NOT EXISTS ffxiv.item_search_category (
	id int PRIMARY KEY,
	name text
);

CREATE TABLE IF NOT EXISTS ffxiv.item (
	id int PRIMARY KEY CHECK (id > 0),
	name text NOT NULL CHECK (char_length(name) <= 255),
	can_be_hq boolean NOT NULL,
	vendor_price int CHECK (vendor_price IS NULL OR vendor_price > 0),
	marketable boolean NOT NULL,
	item_search_category int NOT NULL REFERENCES ffxiv.item_search_category
);

CREATE TABLE IF NOT EXISTS ffxiv.recipe (
	id int PRIMARY KEY CHECK (id > 0),
	item int NOT NULL REFERENCES ffxiv.item,
	count int NOT NULL CHECK (count > 0)
);

CREATE INDEX ON ffxiv.recipe (item);

CREATE TABLE IF NOT EXISTS ffxiv.ingredient (
	recipe int NOT NULL REFERENCES ffxiv.recipe,
	item int NOT NULL REFERENCES ffxiv.item,
	count int NOT NULL CHECK (count > 0),
	PRIMARY KEY(recipe, item)
);

CREATE INDEX ON ffxiv.ingredient (recipe);
CREATE INDEX ON ffxiv.ingredient (item);

CREATE SCHEMA IF NOT EXISTS market;

CREATE TABLE IF NOT EXISTS market.ingredient_info (
	item int PRIMARY KEY REFERENCES ffxiv.item,
	price int NOT NULL
);

CREATE TABLE IF NOT EXISTS market.recipe_info (
	item int PRIMARY KEY REFERENCES ffxiv.item,
	price int NOT NULL,
	velocity double precision NOT NULL,
	hq boolean NOT NULL
);
