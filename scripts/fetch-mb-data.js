#!/usr/bin/env node

import 'dotenv/config';
import Bottleneck from "bottleneck";
import Got from "got";
import PG from "pg";

const pool = new PG.Pool({
	connectionString: process.env.DB_URL,
});

const fetchUniversalisInfoThrottler = new Bottleneck({
	reservoir: 13,
	reservoirIncreaseAmount: 13,
	reservoirIncreaseInterval: 1000,
	reservoirIncreaseMaximum: 13,
	maxConcurrent: 3,
	minTime: 50,
});
async function fetchUniversalisInfoThrottled(id, dcOrWorld) {
	return await fetchUniversalisInfoThrottler.schedule(() => Got(`https://universalis.app/api/${dcOrWorld}/${id}`, { searchParams: { noGst: true }}).json().catch((e) => {
		if (e.response.statusCode === 404) {
			return null;
		}
		throw e;
	}));
}

function* chunk(xs, size) {
	let index = 0;
	while (index < xs.length) {
		let length = Math.min(xs.length - index, size);
		yield xs.slice(index, index + length);
		index += length;
	}
}

async function perform(query, dcOrWorld, handleInfo) {
	const result = await pool.query(query);
	const ids = result.rows.map(i => i.id);
	const ps = [];
	for (const idsChunk of chunk(ids, 100)) {
		const p = fetchUniversalisInfoThrottled(idsChunk.join(','), dcOrWorld)
			.then(async (chunkInfo) => {
				for (const info of chunkInfo.items) {
					await handleInfo(info);
				}
				for (const id of chunkInfo.unresolvedItems) {
					console.log(`Unresolved: ${id} (https://universalis.app/market/${id})`);
				}
			});
		ps.push(p);
	}
	await Promise.all(ps);
}

async function main() {
	const recipesP = perform(
		"SELECT DISTINCT ffxiv.recipe.item AS id FROM ffxiv.recipe, ffxiv.item WHERE ffxiv.recipe.item = ffxiv.item.id AND ffxiv.item.marketable = TRUE",
		"aether",
		async (info) => {
			const hq = Boolean(info.hqSaleVelocity > info.nqSaleVelocity);
			await pool.query("INSERT INTO market.recipe_info VALUES ($1, $2, $3, $4) ON CONFLICT (item) DO UPDATE SET price = $2, velocity = $3, hq = $4", [
				info.itemID,
				(hq ? info.minPriceHQ : info.minPriceNQ) - 1,
				hq ? info.hqSaleVelocity : info.nqSaleVelocity,
				hq
			]);
		}
	);

	const ingredientsP = perform(
		"SELECT DISTINCT ffxiv.ingredient.item AS id FROM ffxiv.ingredient, ffxiv.item WHERE ffxiv.ingredient.item = ffxiv.item.id AND ffxiv.item.marketable = TRUE",
		"aether",
		async (info) => {
			await pool.query("INSERT INTO market.ingredient_info VALUES ($1, $2) ON CONFLICT (item) DO UPDATE SET price = $2", [
				info.itemID,
				info.minPrice
			]);
		}
	);

	await Promise.all([recipesP, ingredientsP]);
}

main();
