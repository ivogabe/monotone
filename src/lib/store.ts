import { maxItem, all, setCompare, setExclude, setAppend } from "./utils";

export interface Storage<TKey, TValue> {
	createStore(values: Map<TKey, TValue>, parents?: Iterable<Store<TKey, TValue>>): Store<TKey, TValue>;
	createEmpty(parents?: Iterable<Store<TKey, TValue>>): Store<TKey, TValue>;
	createSingleton(key: TKey, value: TValue, parents?: Iterable<Store<TKey, TValue>>): Store<TKey, TValue>;
	
	get(store: Store<TKey, TValue>, key: TKey): TValue;
	isEmpty(a: Store<TKey, TValue>): boolean;
	equal(a: Store<TKey, TValue>, b: Store<TKey, TValue>): boolean;
	
	show(store: Store<TKey, TValue>): string;
}
export interface Store<TKey, TValue> {
	values: Map<TKey, TValue>;
	parents: Iterable<Store<TKey, TValue>>;
}
export function createStorage<UKey, UValue>(defaultValue: (key: UKey) => UValue, union: (a: UValue, b: UValue) => UValue, valuesEqual = (a: UValue, b: UValue) => a === b, showKey = (key: UKey) => key.toString(), showValue = (value: UValue) => value.toString()): Storage<UKey, UValue> {
	type UStore = Store<UKey, UValue>;
	
	const knownKeys = new Set<UKey>();

	return { createStore, createEmpty, createSingleton, get, isEmpty, equal, show };

	function createStore(values: Map<UKey, UValue>, parents: Iterable<UStore> = []): UStore {
		for (const key of values.keys()) {
			knownKeys.add(key);
		}
		if (values.size === 0) {
			let store: UStore | undefined;
			for (const parent of parents) {
				if (store) {
					store = parent;
				} else {
					store = undefined;
					break;
				}
			}
			if (store) {
				return store;
			}
		}
		const newValues = new Map(values);
		for (const p of parents) {
			for (const [key, value] of p.values) {
				if (!values.has(key)) {
					const old = newValues.get(key);
					newValues.set(key, old ? union(old, value) : value);
				}
			}
		}
		return { values: newValues, parents: [] };
	}
	function createEmpty(parents: Iterable<UStore> = []) {
		return createStore(new Map(), parents);
	}
	function createSingleton(key: UKey, value: UValue, parents: Iterable<UStore> = []) {
		return createStore(new Map([[key, value]]), parents);
	}
	function get(store: UStore, key: UKey) {
		const stack = [store];
		let hasValue = false;
		let currentValue: UValue | undefined;
		const handled = new Set<UStore>();
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
				for (const parent of s.parents) {
					if (handled.has(parent)) continue;
					handled.add(parent);
					stack.push(parent);
				}
			}
		}
		if (!hasValue) {
			currentValue = defaultValue(key);
		}
		store.values.set(key, currentValue);
		return currentValue!;
	}
	function isEmpty(store: UStore): boolean {
		for (const [key, value] of store.values.entries()) {
			if (!valuesEqual(value, defaultValue(key))) return false;
		}
		return all(store.parents, isEmpty);
	}
	function equal(a: UStore, b: UStore): boolean {
		if (a === b) return true;
		
		for (const key of knownKeys) {
			if (!valuesEqual(get(a, key), get(b, key))) return false;
		}
		return true;
		
		/*
		const checkedKeys = new Set<UKey>();
		const eq = equalHelper(new Set([a]), new Set([b]));
		return eq;
		
		function equalHelper(a: Set<UStore>, b: Set<UStore>, r = 0): boolean {
			if (setCompare(a, b)) return true;
			if (a.size === 0) return all(b.values(), isEmpty);
			if (b.size === 0) return all(a.values(), isEmpty);
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
			
			return equalHelper(aNew, b, r + 1);
		}*/
	}
	function show(store: UStore) {
		const items: string[] = [];
		for (const key of knownKeys) {
			const value = get(store, key);
			if (valuesEqual(value, defaultValue(key))) continue;
			items.push(showKey(key) + " => " + showValue(value));
		}
		if (items.length < 4) {
			return `Store { ${ items.join(", ") } }`;
		}
		return `Store {\n    ${ items.join(",\n    ") }\n}`;
	}
}
