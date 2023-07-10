import { spawn } from "child_process";
import Express from "express";
import PG from "pg";

const pool = new PG.Pool({
	connectionString: process.env.DB_URL,
});

const app = Express();
app.set("view engine", "pug");

app.use(Express.urlencoded({ extended: false }));

const qp = {
	number(qs, key, fallback, { min, max } = {}) {
		let v = key in qs && Number.isNaN(Number(qs[key])) === false ? Number(qs[key]) : fallback;
		if (typeof min === 'number') {
			v = Math.max(v, min);
		}
		if (typeof max === 'number') {
			v = Math.min(v, max);
		}
		return v;
	},
	enum(qs, key, es, fallback) {
		let v = key in qs ? qs[key] : fallback;
		return es.includes(v) ? v : fallback;
	}
};

const scriptRunner = {
	process: null,
	scriptQueue: [],
	fnQueue: [],

	run(name) {
		if (this.process) {
			this.scriptQueue.push(name);
		} else {
			this._startProcess(name);
		}
	},

	_startProcess(name) {
		console.log(`[${name}.js status]: started`);

		this.process = spawn("node", [`./scripts/${name}.js`]);

		this.process.stdout.on("data", (data) => {
			console.log(`[${name}.js stdout]: ${data}`);
		});

		this.process.stderr.on("data", (data) => {
			console.log(`[${name}.js stderr]: ${data}`);
		});

		this.process.on("close", (code) => {
			this.process = null;
			console.log(`[${name}.js status]: finished ${code}`);
			if (this.scriptQueue.length > 0) {
				const next = this.scriptQueue.shift();
				this._startProcess(next);
			} else if (this.fnQueue.length > 0) {
				const fns = this.fnQueue.splice(0);
				for (const fn of fns) {
					fn();
				}
			}
		});
	},

	schedule(fn) {
		if (this.process) {
			this.fnQueue.push(fn);
		} else {
			fn();
		}
	},
};

app.post("/queue/import-ffxiv-data", (req, res) => {
	scriptRunner.run("import-ffxiv-csvs");
	scriptRunner.schedule(() => {
		const search = new URLSearchParams();
		if (req.body.maxItems) {
			search.set("maxItems", req.body.maxItems);
		}
		if (req.body.minVelocity) {
			search.set("minVelocity", req.body.minVelocity);
		}
		if (req.body.itemSearchCategory) {
			search.set("itemSearchCategory", req.body.itemSearchCategory);
		}
		res.redirect(`/?${search.toString()}`);
	});
});

app.post("/queue/refresh-market-info", (req, res) => {
	scriptRunner.run("fetch-mb-data");
	scriptRunner.schedule(() => {
		const search = new URLSearchParams();
		if (req.body.maxItems) {
			search.set("maxItems", req.body.maxItems);
		}
		if (req.body.minVelocity) {
			search.set("minVelocity", req.body.minVelocity);
		}
		if (req.body.itemSearchCategory) {
			search.set("itemSearchCategory", req.body.itemSearchCategory);
		}
		res.redirect(`/?${search.toString()}`);
	});
});

app.get("/", (req, res) => {
	scriptRunner.schedule(async () => {
		const minVelocity = qp.number(req.query, 'minVelocity', 0.7, { min: 0, max: 5 });
		const maxItems = qp.number(req.query, 'maxItems', 200, { min: 50, max: 2000 });

		try {
			const itemSearchCategoryResults = await pool.query(
				"SELECT * FROM ffxiv.item_search_category WHERE ffxiv.item_search_category.id > 0 AND ffxiv.item_search_category.id < 88",
			);

			const itemSearchCategory = qp.enum(req.query, 'itemSearchCategory', itemSearchCategoryResults.rows.map(x => x.id.toString()), null);

			const itemResult = await pool.query(
				"SELECT * FROM market.recipe_profit_report WHERE velocity > $1 AND (item_search_category = $3 OR $3 IS NULL) ORDER BY profit_after_tax DESC LIMIT $2",
				[minVelocity, maxItems, itemSearchCategory],
			);

			res.render("index.pug", {
				itemSearchCategories: itemSearchCategoryResults.rows,
				reportResults: itemResult.rows,
				minVelocity,
				maxItems,
				itemSearchCategory
			});
		} catch (e) {
			console.error(e);

			res.render("index.pug", {
				itemSearchCategories: [],
				reportResults: [],
				minVelocity,
				maxItems,
				itemSearchCategory: null
			});
		}
	});
});

app.listen(Number(process.env.PORT), () => {
	console.log(`Listening on ${process.env.PORT}.`);
});
