import { ItemId, Recipe, RecipeId } from "./data-types";
import { DB } from "./db";
import { MarketBoard } from "./market-board";

type IngredientReport = {
	count: number;
	costReport: ItemCostReport;
};

type ItemCostReport = {
	item: ItemId;
	price: number;
} & (
	| {
			method: "vendor";
	  }
	| {
			method: "mb";
	  }
	| {
			method: "craft";
			count: number;
			ingredients: IngredientReport[];
	  }
);

type RecipeProfitability = {
	recipeId: RecipeId;
	itemId: ItemId;
	name: string;
	hq: boolean;
	velocity: number;
	price: number;
	cost: number;
	profit: number;
	ingredients: IngredientReport[];
};

export class Reporter {
	private _costReportCache: Map<ItemId, ItemCostReport[]> = new Map();

	constructor(
		private db: DB,
		private sellMarketBoard: MarketBoard,
		private buyMarketBoard: MarketBoard,
	) {}

	public *recipeProfitabilityReport(
		recipes: Iterable<Recipe> = this.db.recipes,
	): Generator<RecipeProfitability, void, undefined> {
		for (const recipe of recipes) {
			const item = this.db.getItem(recipe.item);
			const costReport = this.optimalCostReportForItem(item.id);
			if (costReport === null || costReport.method !== "craft") {
				continue;
			}
			const resultMarketBoardInfo = this.sellMarketBoard.get(item.id);
			if (!resultMarketBoardInfo) {
				continue;
			}
			const { hq, velocity, price } =
				resultMarketBoardInfo.hq.velocity > resultMarketBoardInfo.nq.velocity
					? resultMarketBoardInfo.hq
					: resultMarketBoardInfo.nq;
			yield {
				recipeId: recipe.id,
				itemId: item.id,
				name: item.name,
				hq,
				velocity,
				price,
				cost: costReport.price,
				profit: Math.round(price * 0.95 - costReport.price * 1.05),
				ingredients: costReport.ingredients,
			};
		}
	}

	public costReportsForItem(itemId: ItemId): ItemCostReport[] {
		const cached = this._costReportCache.get(itemId);
		if (cached) {
			return cached;
		}

		const possibilities: ItemCostReport[] = [];
		const item = this.db.getItem(itemId);

		if (item.vendorPrice) {
			possibilities.push({
				item: itemId,
				method: "vendor",
				price: item.vendorPrice,
			});
		}

		if (item.itemSearchCategory) {
			const mbData = this.buyMarketBoard.get(item.id);
			if (mbData) {
				possibilities.push({
					item: itemId,
					method: "mb",
					price: mbData.nq.price,
				});
			}
		}

		recipeLoop: for (const recipe of this.db.getRecipesForItem(itemId)) {
			const ingredients = this.db.getIngredientsForRecipe(recipe.id);
			const ingredientReports: IngredientReport[] = [];
			for (const i of ingredients) {
				const costReport = this.optimalCostReportForItem(i.item);
				if (!costReport) {
					continue recipeLoop;
				}
				ingredientReports.push({
					count: i.count,
					costReport,
				});
			}
			possibilities.push({
				item: itemId,
				method: "craft",
				price: ingredientReports.reduce((acc, report) => {
					const factor =
						report.costReport.method === "craft"
							? report.count / report.costReport.count
							: report.count;
					return Math.round(acc + factor * report.costReport.price);
				}, 0),
				count: recipe.count,
				ingredients: ingredientReports,
			});
		}

		this._costReportCache.set(itemId, possibilities);
		return possibilities;
	}

	public optimalCostReportForItem(itemId: ItemId): ItemCostReport | null {
		let possibilities = this._costReportCache.get(itemId);
		if (!possibilities) {
			possibilities = this.costReportsForItem(itemId);
		}
		if (possibilities.length === 0) {
			return null;
		}
		return possibilities.reduce((cheapest, current) =>
			cheapest.price > current.price ? current : cheapest,
		);
	}
}
