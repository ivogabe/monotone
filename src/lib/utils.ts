import { SyntaxKind, BinaryExpression } from "typescript";

export function maxItem<U>(xs: Iterable<U>, value: (x: U) => number): U | undefined {
	let best: U | undefined;
	let bestValue = Infinity;
	for (const x of xs) {
		let current = value(x);
		if (current < bestValue) {
			best = x;
			bestValue = current;
		}
	}
	return best;
}
export function all<U>(xs: Iterable<U>, check: (x: U) => boolean) {
	for (const x of xs) {
		if (!check(x)) return false;
	}
	return true;
}

export function setUnion<U>(a: Set<U>, b: Set<U>) {
	if (b.size > a.size) [a, b] = [b, a];
	return setAppend(a, b);
}
export function setAppend<U>(a: Iterable<U>, b: Iterable<U>) {
	const result = new Set(a);
	for (const entry of b) {
		result.add(entry);
	}
	return result;
}
export function setCompare<U>(a: Set<U>, b: Set<U>) {
	if (a.size !== b.size) return false;
	for (const entry of a) {
		if (!b.has(entry)) return false;
	}
	return true;
}
export function setExclude<U>(set: Set<U>, value: U) {
	return new Set(generate());
	
	function* generate() {
		for (const x of set) {
			if (x !== value) {
				yield x;
			}
		}
	}
}

export function toArray<U>(value: U | U[]) {
	if (value instanceof Array) {
		return value;
	} else {
		return [value];
	}
}
export function isLogicalBinaryExpression(node: BinaryExpression) {
	switch (node.operatorToken.kind) {
		case SyntaxKind.AmpersandAmpersandToken:
		case SyntaxKind.BarBarToken:
			return true;
		default:
			return false;
	}
}

export function iterableIsEmpty(iterable: Iterable<any>) {
	return iterable[Symbol.iterator]().next().done;
}

export function Map2D<UKey1, UKey2, UValue>() {
	const map = new Map<UKey1, Map<UKey2, UValue>>();

	return { get, getOrCreate, set, keys, keysForKey, sizeForKey };

	function get(key1: UKey1, key2: UKey2) {
		const m = map.get(key1);
		if (m === undefined) return undefined;
		return m.get(key2);
	}
	function getOrCreate(key1: UKey1, key2: UKey2, value: UValue): UValue {
		const v = get(key1, key2);
		if (v !== undefined) return v;
		set(key1, key2, value);
		return value;
	}
	function set(key1: UKey1, key2: UKey2, value: UValue | undefined) {
		let m = map.get(key1);
		if (m === undefined) {
			m = new Map();
			map.set(key1, m);
		}
		m.set(key2, value);
	}
	function keys() {
		return map.keys();
	}
	function* keysForKey(key: UKey1) {
		const m = map.get(key);
		if (m === undefined) return;
		yield* m.keys();
	}
	function sizeForKey(key: UKey1) {
		const m = map.get(key);
		if (m === undefined) return 0;
		return m.size;
	}
}
