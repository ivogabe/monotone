export interface Storage<TKey, TValue> {
	createStore(values: Map<TKey, TValue>, parents?: Store<TKey, TValue>[]): Store<TKey, TValue>;
	get(store: Store<TKey, TValue>, key: TKey): TValue;
}
export interface Store<TKey, TValue> {
	values: Map<TKey, TValue>;
	parents: Store<TKey, TValue>[];
}
export function createStorage<UKey, UValue>(defaultValue: (key: UKey) => UValue, union: (a: UValue, b: UValue) => UValue): Storage<UKey, UValue> {
	type UStore = Store<UKey, UValue>;
	
	return { createStore, get };
	
	function createStore(values: Map<UKey, UValue>, parents: Store<UKey, UValue>[] = []): UStore {
		return { values, parents };
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
}
