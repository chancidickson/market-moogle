import { assert } from "@sindresorhus/is";
import { XivDataFetcher } from "./xiv-data-fetcher";
import {
	ItemId,
	Item,
	ItemSearchCategoryId,
	ItemSearchCategory,
	RecipeId,
	Recipe,
	Ingredient,
} from "./data-types";

export class DB {
	private recipeByItemIndex: Map<ItemId, RecipeId[]>;

	private constructor(
		private readonly itemSearchCategoryTable: Map<
			ItemSearchCategoryId,
			ItemSearchCategory
		>,
		private readonly itemTable: Map<ItemId, Item>,
		private readonly recipeTable: Map<RecipeId, Recipe>,
		private readonly ingredientTable: Map<RecipeId, Ingredient[]>,
	) {
		this.recipeByItemIndex = this.buildRecipeByItemIndex(recipeTable);
	}

	get items(): Iterable<Item> {
		return this.itemTable.values();
	}

	get itemIds(): Iterable<ItemId> {
		return this.itemTable.keys();
	}

	get recipes(): Iterable<Recipe> {
		return this.recipeTable.values();
	}

	public getItem(id: ItemId): Item {
		return this.get(this.itemTable, id);
	}

	public getIngredientsForRecipe(id: RecipeId): Ingredient[] {
		return this.get(this.ingredientTable, id);
	}

	public getRecipe(id: RecipeId): Recipe {
		return this.get(this.recipeTable, id);
	}

	public *getRecipesForItem(id: ItemId): Generator<Recipe, void, void> {
		const recipeIds = this.recipeByItemIndex.get(id) ?? [];
		for (const recipeId of recipeIds) {
			yield this.getRecipe(recipeId);
		}
	}

	private get<Id, Data>(map: Map<Id, Data>, id: Id): Data {
		const value = map.get(id);
		if (!value) {
			throw new Error(`Could not find data with id ${id}`);
		}
		return value;
	}

	static async from(commitish: string) {
		const fetcher: XivDataFetcher = new XivDataFetcher(commitish);

		const [itemSearchCategoryData, gilShopItemData, itemData, recipeData] =
			await Promise.all([
				fetcher.fetch("ItemSearchCategory"),
				fetcher.fetch("GilShopItem"),
				fetcher.fetch("Item"),
				fetcher.fetch("Recipe"),
			]);

		const itemSearchCategories = new Map(
			this.normalizeItemSearchCategories(itemSearchCategoryData),
		);
		const items = new Map(
			this.normalizeItems(
				itemData,
				this.normalizeGilShopItems(gilShopItemData),
			),
		);
		const recipes = new Map(this.normalizeRecipes(recipeData));
		const ingredients = new Map(this.normalizeIngredients(recipeData));

		return new DB(itemSearchCategories, items, recipes, ingredients);
	}

	private static *normalizeItemSearchCategories(
		rows: Iterable<unknown[]>,
	): Generator<[ItemSearchCategoryId, ItemSearchCategory], void, void> {
		for (const row of rows) {
			const id = row[0];
			assert.number(id);
			const name = row[1];
			assert.string(name);

			yield [id, { id, name }];
		}
	}

	private static *normalizeGilShopItems(
		rows: Iterable<unknown[]>,
	): Generator<ItemId, void, void> {
		for (const row of rows) {
			assert.array(row);
			const itemId = row[1];
			assert.number(itemId);

			yield itemId;
		}
	}

	private static *normalizeItems(
		rows: Iterable<unknown[]>,
		gilShopItemIds: Iterable<ItemId>,
	): Generator<[ItemId, Item], void, void> {
		const gilShopItems = new Set(gilShopItemIds);

		for (const row of rows) {
			assert.array(row);
			const id = row[0];
			assert.number(id);
			if (id <= 0) {
				continue;
			}
			const name = row[10];
			assert.string(name);
			if (name === "") {
				continue;
			}
			const hqPossible = row[28];
			assert.string(hqPossible);
			const vendorPrice = row[26];
			assert.number(vendorPrice);
			const itemSearchCategory = row[17];
			assert.number(itemSearchCategory);

			yield [
				id,
				{
					id,
					name,
					hqPossible: hqPossible === "True",
					vendorPrice: gilShopItems.has(id) ? vendorPrice : null,
					itemSearchCategory:
						itemSearchCategory !== 0 ? itemSearchCategory : null,
				},
			];
		}
	}

	private static *normalizeRecipes(
		rows: Iterable<unknown[]>,
	): Generator<[RecipeId, Recipe], void, void> {
		for (const row of rows) {
			assert.array(row);
			const id = row[0];
			assert.number(id);
			if (id <= 0) {
				continue;
			}
			const item = row[4];
			assert.number(item);
			if (item <= 0) {
				continue;
			}
			const count = row[5];
			assert.number(count);

			yield [id, { id, item, count }];
		}
	}

	private static *normalizeIngredients(
		rows: Iterable<unknown[]>,
	): Generator<[RecipeId, Ingredient[]], void, void> {
		for (const row of rows) {
			assert.array(row);
			const recipeId = row[0];
			assert.number(recipeId);
			const recipeIngredients: Ingredient[] = [];

			for (let index = 0; index < 10; index++) {
				const itemId = row[6 + index * 2];
				assert.number(itemId);
				const count = row[7 + index * 2];
				assert.number(count);

				if (count > 0) {
					recipeIngredients.push({
						recipe: recipeId,
						item: itemId,
						count,
					});
				}
			}

			yield [recipeId, recipeIngredients];
		}
	}

	private buildRecipeByItemIndex(
		recipes: Map<RecipeId, Recipe>,
	): Map<ItemId, RecipeId[]> {
		const m = new Map<ItemId, RecipeId[]>();
		for (const recipe of recipes.values()) {
			const recipes = m.get(recipe.item) ?? [];
			m.set(recipe.item, [...recipes, recipe.id]);
		}
		return m;
	}
}
