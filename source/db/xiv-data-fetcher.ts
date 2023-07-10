import Got from "got";
import { parse, Options as ParseOptions } from "csv-parse";

export class XivDataFetcher {
	constructor(private commitish: string) {}

	public async fetch(name: string): Promise<unknown[][]> {
		const text = await Got.get(
			`https://raw.githubusercontent.com/xivapi/ffxiv-datamining/${this.commitish}/csv/${name}.csv`,
		).text();
		return await this.parse(text, { cast: true, from: 4 });
	}

	private parse(text: string, options: ParseOptions): Promise<unknown[][]> {
		return new Promise((resolve, reject) => {
			parse(text, options, (err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		});
	}
}
