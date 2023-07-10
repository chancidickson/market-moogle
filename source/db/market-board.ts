import Got from "got";
import { ItemId } from "./data-types";
import { DB } from "./db";
import is, { assert } from "@sindresorhus/is";
import { Query } from "../iterator-utils";

type MarketBoardInfo = {
	item: ItemId;
	dcOrWorld: string;
	nq: {
		hq: false;
		price: number;
		velocity: number;
	};
	hq: {
		hq: true;
		price: number;
		velocity: number;
	};
};

type UniversalisMultiResponse<T> = {
	items: (T & { itemID: number })[];
	itemIDs: number[];
	unresolvedItems: number[];
};

type UniversalisDataResponse = UniversalisMultiResponse<{
	minPriceNQ: number;
	minPriceHQ: number;
}>;

type UniversalisHistoryResponse = UniversalisMultiResponse<{
	nqSaleVelocity: number;
	hqSaleVelocity: number;
}>;

type MarketBoardState =
	| {
			state: "UNFETCHED";
	  }
	| {
			state: "FETCHING";
			promise: Promise<void>;
			previousData: Map<ItemId, MarketBoardInfo> | null;
	  }
	| {
			state: "FETCHED";
			data: Map<ItemId, MarketBoardInfo>;
	  }
	| {
			state: "ERROR";
			error: Error;
	  };

interface Throttler {
	schedule<T>(fn: () => PromiseLike<T>): Promise<T>;
}

export class MarketBoard {
	private _state: MarketBoardState = { state: "UNFETCHED" };

	constructor(
		public readonly dcOrWorld: string,
		private db: DB,
		private throttler: Throttler,
	) {}

	get state() {
		return this._state.state;
	}

	get error() {
		return this._state.state === "ERROR" ? this._state.error : null;
	}

	public get(itemId: ItemId): MarketBoardInfo | undefined {
		const data = this.getData();
		if (data === null) {
			throw new Error("Data has not been fetched.");
		}
		return data.get(itemId);
	}

	private getData(): Map<ItemId, MarketBoardInfo> | null {
		if (this._state.state === "FETCHED") {
			return this._state.data;
		}
		if (this._state.state === "FETCHING" && this._state.previousData !== null) {
			return this._state.previousData;
		}
		return null;
	}

	public async fetch() {
		if (this._state.state !== "FETCHING") {
			const promise = this.fetchJob().then(
				(newData) => {
					this._state = {
						state: "FETCHED",
						data: newData,
					};
				},
				(error: Error) => {
					this._state = {
						state: "ERROR",
						error,
					};
				},
			);
			this._state = {
				state: "FETCHING",
				promise,
				previousData: this._state.state === "FETCHED" ? this._state.data : null,
			};
		}
		return await this._state.promise;
	}

	public async wait(): Promise<void> {
		if (this._state.state === "FETCHING") {
			await this._state.promise;
		}
	}

	private async fetchJob(): Promise<Map<ItemId, MarketBoardInfo>> {
		const newData = new Map<ItemId, MarketBoardInfo>();
		const marketableItemIdGroups = new Query(this.db.items)
			.where(
				(item) =>
					is.number(item.itemSearchCategory) && item.itemSearchCategory > 0,
			)
			.select((item) => item.id)
			.group(100);

		for (const ids of marketableItemIdGroups) {
			const data = await this.throttler.schedule(() =>
				Got.get(
					`https://universalis.app/api/${this.dcOrWorld}/${ids.join(",")}`,
					{
						retry: 10,
						searchParams: { listings: 0, entries: 0, noGst: true },
					},
				).json(),
			);
			this.assertUniversalisDataResponseShape(data);
			const itemDataMap = this.intoMap(data);

			const history = await this.throttler.schedule(() =>
				Got.get(
					`https://universalis.app/api/history/${this.dcOrWorld}/${ids.join(
						",",
					)}`,
					{
						retry: 10,
						searchParams: { entries: 0 },
					},
				).json(),
			);
			this.assertUniversalisHistoryResponseShape(history);
			const historyDataMap = this.intoMap(history);

			for (const data of itemDataMap.values()) {
				const history = historyDataMap.get(data.itemID);
				if (!history) {
					continue;
				}

				newData.set(data.itemID, {
					item: data.itemID,
					dcOrWorld: this.dcOrWorld,
					nq: {
						hq: false,
						price: data.minPriceNQ,
						velocity: history.nqSaleVelocity,
					},
					hq: {
						hq: true,
						price: data.minPriceHQ,
						velocity: history.hqSaleVelocity,
					},
				});
			}
		}

		return newData;
	}

	private intoMap<T extends { itemID: number }>(response: {
		items: T[];
	}): Map<number, T> {
		const m = new Map<number, T>();
		for (const item of response.items) {
			m.set(item.itemID, item);
		}
		return m;
	}

	private assertUniversalisDataResponseShape(
		response: unknown,
	): asserts response is UniversalisDataResponse {
		assert.object(response);
		assert.array(response.items);

		for (const item of response.items) {
			assert.object(item);
			assert.number(item.itemID);
			assert.number(item.minPriceNQ);
			assert.number(item.minPriceHQ);
		}
	}

	private assertUniversalisHistoryResponseShape(
		response: unknown,
	): asserts response is UniversalisHistoryResponse {
		assert.object(response);
		assert.array(response.items);

		for (const item of response.items) {
			assert.object(item);
			assert.number(item.itemID);
			assert.number(item.nqSaleVelocity);
			assert.number(item.hqSaleVelocity);
		}
	}
}
