CREATE
OR REPLACE VIEW market.recipe_profit_report AS WITH recipe AS (
	SELECT
		result_item.id,
		ffxiv.recipe.id AS recipe_id,
		result_item.name,
		result_item.item_search_category,
		market.recipe_info.hq,
		market.recipe_info.velocity,
		market.recipe_info.price :: bigint * ffxiv.recipe.count AS sell_price,
		SUM(
			LEAST(
				market.ingredient_info.price,
				ingredient_item.vendor_price
			) :: bigint * ffxiv.ingredient.count
		) AS manufacture_cost
	FROM
		ffxiv.recipe,
		ffxiv.item AS result_item,
		ffxiv.item AS ingredient_item,
		ffxiv.ingredient,
		market.recipe_info,
		market.ingredient_info
	WHERE
		ffxiv.recipe.item = result_item.id
		AND ffxiv.recipe.item = market.recipe_info.item
		AND ffxiv.ingredient.recipe = ffxiv.recipe.id
		AND ffxiv.ingredient.item = ingredient_item.id
		AND ffxiv.ingredient.item = market.ingredient_info.item
		AND result_item.marketable = TRUE
		AND result_item.vendor_price IS NULL
		AND NOT EXISTS (
			SELECT
				*
			FROM
				ffxiv.ingredient,
				ffxiv.item
			WHERE
				ffxiv.ingredient.recipe = ffxiv.recipe.id
				AND ffxiv.item.id = ffxiv.ingredient.item
				AND ffxiv.item.marketable = FALSE
		)
	GROUP BY
		result_item.id,
		ffxiv.recipe.id,
		result_item.name,
		market.recipe_info.hq,
		market.recipe_info.velocity,
		market.recipe_info.price
)
SELECT
	*,
	recipe.sell_price - recipe.manufacture_cost AS profit,
	ROUND(
		recipe.sell_price * 0.95 - recipe.manufacture_cost * 1.05
	) AS profit_after_tax
FROM
	recipe;
