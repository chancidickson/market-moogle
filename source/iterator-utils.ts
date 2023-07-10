import * as assert from "assert";

export function* group<T>(
	xs: Iterable<T>,
	size: number,
): Generator<T[], void, void> {
	assert.ok(size > 0);
	let buffer: T[] = [];
	for (const x of xs) {
		buffer.push(x);
		if (buffer.length === size) {
			yield buffer;
			buffer = [];
		}
	}
	if (buffer.length > 0) {
		yield buffer;
	}
}

export function* select<T, U>(
	xs: Iterable<T>,
	fn: (t: T) => U,
): Generator<U, void, void> {
	for (const x of xs) {
		yield fn(x);
	}
}

export function* where<T>(
	xs: Iterable<T>,
	fn: (t: T) => boolean,
): Generator<T, void, void> {
	for (const x of xs) {
		if (fn(x)) {
			yield x;
		}
	}
}

export class Query<T> implements Iterable<T> {
	constructor(private it: Iterable<T>) {}

	*[Symbol.iterator](): Generator<T, void, void> {
		for (const x of this.it) {
			yield x;
		}
	}

	group(size: number): Query<T[]> {
		return new Query(group(this.it, size));
	}

	select<U>(fn: (item: T) => U): Query<U> {
		return new Query(select(this.it, fn));
	}

	orderBy(fn: (a: T, b: T) => number): Query<T> {
		return new Query(this.into().sort(fn));
	}

	where(fn: (item: T) => boolean): Query<T> {
		return new Query(where(this.it, fn));
	}

	into(): T[] {
		return Array.from(this.it);
	}
}
