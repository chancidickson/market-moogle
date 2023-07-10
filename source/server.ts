import Bottleneck from "bottleneck";
import Fastify from "fastify";
import FastifyFormBody from "fastify-formbody";
import FastifyBasicAuth from "fastify-basic-auth";
import is, { assert } from "@sindresorhus/is";
import PointOfView from "point-of-view";
import Pug from "pug";
import * as SafeEval from "expression-eval";
import { DB } from "./db/db";
import { MarketBoard } from "./db/market-board";
import { Reporter } from "./db/reporter";
import { Query } from "./iterator-utils";

const db = await DB.from("master");
const marketBoardThrottler = new Bottleneck({
	reservoir: 13,
	reservoirIncreaseAmount: 13,
	reservoirIncreaseInterval: 1000,
	reservoirIncreaseMaximum: 13,
	maxConcurrent: 3,
	minTime: 50,
});
// const mbDc = new MarketBoard("aether", db, marketBoardThrottler);
const mbWd = new MarketBoard("faerie", db, marketBoardThrottler);

const app = Fastify({ logger: true });

app.register(FastifyFormBody);
app.register(PointOfView, {
	engine: {
		pug: Pug,
	},
});

app.register(FastifyBasicAuth, {
	authenticate: { realm: "market-moogle" },
	validate(_username, password, _req, _res, done) {
		if (password === process.env.PASSWORD) {
			done();
		} else {
			done(new Error("Invalid username or password."));
		}
	},
});

app.after(() => {
	if (process.env.NODE_ENV === "production") {
		app.addHook("onRequest", app.basicAuth);
	}

	app.route({
		method: "POST",
		url: "/refresh-market-info",
		async handler(req, res) {
			const mbs = [
				mbWd,
				mbWd, // mbDc,
			] as const;
			for (const mb of mbs) {
				mb.fetch();
			}
			assert.string(req.raw.url);
			assert.object(req.body);
			const url = new URL("/", `${req.protocol}://${req.headers.host}`);
			for (const [key, value] of Object.entries(req.body)) {
				assert.string(value);
				if (value) {
					url.searchParams.set(key, value);
				}
			}
			return res.redirect(302, url.toString());
		},
	});

	app.route({
		method: "GET",
		url: "/:id",
		schema: {
			params: {
				type: "object",
				properties: {
					id: { type: "integer" },
				},
			},
			querystring: {
				type: "object",
				properties: {
					velocity: { type: "number", default: 0.7 },
				},
			},
		},
		async handler(req, res) {
			assert.object(req.params);
			assert.number(req.params.id);
			const reports = new Reporter(db, mbWd, mbWd).costReportsForItem(
				req.params.id,
			);
			return res.send(reports);
		},
	});

	app.route({
		method: "GET",
		url: "/",
		schema: {
			querystring: {
				type: "object",
				properties: {
					cost: { type: "number", nullable: true, default: null },
					profit: { type: "number", nullable: true, default: null },
					sortBy: { type: "string", nullable: true, default: null },
					velocity: { type: "number", nullable: true, default: null },
				},
			},
		},
		async handler(req, res) {
			assert.object(req.query);
			const { cond, sort } = req.query;

			const mbs = [
				mbWd,
				mbWd, // mbDc,
			] as const;

			const viewData = {
				states: mbs.map((mb) => ({
					name: mb.dcOrWorld,
					state: mb.state,
					error: mb.error,
				})),
				query: req.query,
			};

			if (mbs.some((mb) => mb.state !== "FETCHED")) {
				return res.view("/views/index.pug", {
					...viewData,
					report: null,
				});
			}

			const reporter = new Reporter(db, ...mbs);

			let reportQuery = new Query(reporter.recipeProfitabilityReport());

			if (is.string(cond) && cond.trim() !== "") {
				const ast = SafeEval.parse(cond);
				reportQuery = reportQuery.where((report) => SafeEval.eval(ast, report));
			}

			if (is.string(sort)) {
				const match = sort.match(/(-?)([A-Za-z]+)/);
				if (match) {
					const ascending = !match[1];
					const property = match[2];

					if (
						property === "profit" ||
						property === "velocity" ||
						property === "cost" ||
						property === "price"
					) {
						reportQuery = reportQuery.orderBy((a, b) =>
							ascending ? a[property] - b[property] : b[property] - a[property],
						);
					}
				}
			}

			return res.view("/views/index.pug", {
				...viewData,
				report: reportQuery.into(),
			});
		},
	});
});

app.listen(Number(process.env.PORT || 3000), "0.0.0.0");

process.on("SIGINT", () => {
	app.close();
	process.exit(0);
});

process.on("SIGTERM", () => {
	app.close();
	process.exit(0);
});
