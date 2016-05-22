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
