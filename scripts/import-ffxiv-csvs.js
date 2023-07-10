#!/usr/bin/env node

import "dotenv/config";
import CSV from "csv";
import Got from "got";
import PG from "pg";
import { promisify } from "util";

const csvParse = promisify(CSV.parse.bind(CSV));

const pool = new PG.Pool({
	connectionString: process.env.DB_URL,
});

async function downloadAndParseCsv(name) {
	const text = await Got.get(
		`https://github.com/xivapi/ffxiv-datamining/raw/a2961f82931c5a434e53f57cf7b81d225bd25b8a/csv/${name}.csv`,
	).text();
	return await csvParse(text, { from_line: 4 });
}

async function main() {
	const ps = [];

	const client = await pool.connect();

	await client.query("BEGIN");
	await client.query("SET CONSTRAINTS ALL DEFERRED");

	const itemSearchCategoryEntries = await downloadAndParseCsv("ItemSearchCategory");
	for (const itemSearchCategoryEntry of itemSearchCategoryEntries) {
		ps.push(
			client.query(
				"INSERT INTO ffxiv.item_search_category VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = excluded.name",
				[
					itemSearchCategoryEntry[0],
					itemSearchCategoryEntry[1],
				]
			)
		);
	}

	const gilShopItemEntries = await downloadAndParseCsv("GilShopItem");
	const itemEntries = await downloadAndParseCsv("Item");

	const itemsSoldByVendors = new Set(
		gilShopItemEntries.map((entry) => entry[1]),
	);

	for (const itemEntry of itemEntries) {
		if (itemEntry[0] <= 0 || itemEntry[10] === "") {
			continue;
		}
		ps.push(
			client.query(
				"INSERT INTO ffxiv.item VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name = $2, can_be_hq = $3, vendor_price = $4, marketable = $5, item_search_category = $6",
				[
					itemEntry[0],
					itemEntry[10],
					itemEntry[28] === "True",
					itemsSoldByVendors.has(itemEntry[0]) ? Number(itemEntry[26]) : null,
					itemEntry[17] !== "0",
					itemEntry[17]
				],
			),
		);
	}

	const recipeEntries = await downloadAndParseCsv("Recipe");

	for (const recipeEntry of recipeEntries) {
		if (recipeEntry[4] === "0") {
			continue;
		}

		ps.push(
			client.query(
				"INSERT INTO ffxiv.recipe VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET item = $2, count = $3",
				[recipeEntry[0], recipeEntry[4], recipeEntry[5]],
			),
		);

		for (let index = 0; index < 10; index++) {
			const id = recipeEntry[6 + index * 2];
			const count = recipeEntry[7 + index * 2];

			if (count > 0) {
				ps.push(
					client.query(
						"INSERT INTO ffxiv.ingredient (recipe, item, count) VALUES ($1, $2, $3) ON CONFLICT (recipe, item) DO UPDATE SET count = $3",
						[recipeEntry[0], id, count],
					),
				);
			}
		}
	}

	await Promise.all(ps);
	await client.query("COMMIT");
	client.release();
}

main();
