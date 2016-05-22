import { maxItem, all, setCompare, setExclude, setAppend } from "./utils";

export interface Storage<TKey, TValue> {
	createStore(values: Map<TKey, TValue>, parents?: Iterable<Store<TKey, TValue>>): Store<TKey, TValue>;
	get(store: Store<TKey, TValue>, key: TKey): TValue;
	empty(a: Store<TKey, TValue>): boolean;
	equal(a: Store<TKey, TValue>, b: Store<TKey, TValue>): boolean;
}
export interface Store<TKey, TValue> {
	values: Map<TKey, TValue>;
	parents: Iterable<Store<TKey, TValue>>;
	size: number;
}
export function createStorage<UKey, UValue>(defaultValue: (key: UKey) => UValue, union: (a: UValue, b: UValue) => UValue, valuesEqual = (a: UValue, b: UValue) => a === b): Storage<UKey, UValue> {
	type UStore = Store<UKey, UValue>;

	return { createStore, get, empty, equal };
	
	function createStore(values: Map<UKey, UValue>, parents: Iterable<Store<UKey, UValue>> = []): UStore {
		let size = 1;
		for (const p of parents) size += p.size;
		return { values, parents, size };
	}
	function get(store: UStore, key: UKey) {
		const stack = [store];
		let hasValue = false;
		let currentValue: UValue | undefined;
		while (stack.length !== 0) {
			const s = stack.pop()!;
			if (s.values.has(key)) {
				const value = s.values.get(key)!;
				if (hasValue) {
					currentValue = union(currentValue!, value);
				} else {
					hasValue = true;
					currentValue = value;
				}
			} else {
				stack.push(...s.parents);
			}
		}
		if (!hasValue) {
			currentValue = defaultValue(key);
		}
		store.values.set(key, currentValue);
		return currentValue!;
	}
	function empty(store: UStore): boolean {
		for (const [key, value] of store.values.entries()) {
			if (!valuesEqual(value, defaultValue(key))) return false;
		}
		return all(store.parents, empty);
	}
	function equal(a: UStore, b: UStore): boolean {
		if (a === b) return true;
		
		const checkedKeys = new Set<UKey>();
		return equalHelper(new Set([a]), new Set([b]));
		
		function equalHelper(a: Set<UStore>, b: Set<UStore>): boolean {
			if (setCompare(a, b)) return true;
			if (a.size === 0) return all(b.values(), empty);
			if (b.size === 0) return all(a.values(), empty);
			// a, b not empty
			let maxA = maxItem(a, s => s.size)!;
			let maxB = maxItem(b, s => s.size)!;
			
			if (maxA.size < maxB.size) {
				[a, b] = [b, a];
				[maxA, maxB] = [maxB, maxA];
			}
			const aRest = setExclude(a, maxA);
			
			const synthesizedStoreA = createStore(new Map(), aRest);
			const synthesizedStoreB = createStore(new Map(), b);
			
			for (const [key, value] of maxA.values.entries()) {
				if (checkedKeys.has(key)) continue;
				checkedKeys.add(key);
				const valueA = union(get(synthesizedStoreA, key), value);
				const valueB = get(synthesizedStoreB, key);
				if (!valuesEqual(valueA, valueB)) return false;
			}
			
			const aNew = setAppend(aRest, maxA.parents);
			
			return equalHelper(aNew, b);
		}
	}
	
}
