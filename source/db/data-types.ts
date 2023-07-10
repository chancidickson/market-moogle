export type ItemSearchCategoryId = number;
export type ItemSearchCategory = {
	id: ItemSearchCategoryId;
	name: string;
};

export type ItemId = number;
export type Item = {
	id: ItemId;
	name: string;
	hqPossible: boolean;
	vendorPrice: number | null;
	itemSearchCategory: number | null;
};

export type RecipeId = number;
export type Recipe = {
	id: RecipeId;
	item: ItemId;
	count: number;
};

export type Ingredient = {
	recipe: RecipeId;
	item: ItemId;
	count: number;
};
