import test from "ava";
import { createStorage } from "../lib/store";

function create() {
	return createStorage<string, number>(() => 0, (a, b) => a + b, (a, b) => a === b);
}

test("empty", t => {
	const storage = create();
	const store = storage.createStore(new Map());
	t.is(storage.get(store, ""), 0);
	t.is(storage.get(store, "foo"), 0);
});

test("self", t => {
	const storage = create();
	// TODO: Remove cast (see https://github.com/Microsoft/TypeScript/issues/8407)
	const store = storage.createStore(new Map([<[string, number]>["", 42]]));
	t.is(storage.get(store, ""), 42);
	t.is(storage.get(store, "foo"), 0);
});

test("falsy", t => {
	const storage = createStorage<string, any>(() => 1, (a, b) => a + b, (a, b) => a === b);
	// TODO: Remove cast (see https://github.com/Microsoft/TypeScript/issues/8407)
	const store = storage.createStore(new Map([
		<[string, any]>["a", undefined],
		<[string, any]>["b", false],
		<[string, any]>["c", 0],
		<[string, any]>["d", ""]
	]));
	t.is(storage.get(store, "a"), undefined);
	t.is(storage.get(store, "b"), false);
	t.is(storage.get(store, "c"), 0);
	t.is(storage.get(store, "d"), "");
});

test("parent", t => {
	const storage = create();
	const storeA = storage.createStore(new Map([
		<[string, number]>["x", 10],
		<[string, number]>["y", 11]
	]));
	const storeB = storage.createStore(new Map([
		<[string, number]>["x", 20],
		<[string, number]>["z", 21]
	]));
	const storeC = storage.createStore(new Map([<[string, number]>["z", 5]]), [storeA, storeB]);
	t.is(storage.get(storeC, "y"), 11); // storeA
	t.is(storage.get(storeC, "z"), 5); // overriden
	t.is(storage.get(storeC, "x"), 30); // combined
	t.is(storage.get(storeC, ""), 0); // not set
});

test("equal", t => {
	const storage = create();
	const storeA = storage.createStore(new Map([
		<[string, number]>["x", 10],
		<[string, number]>["y", 11]
	]));
	const storeB = storage.createStore(new Map([
		<[string, number]>["x", 20],
		<[string, number]>["z", 21]
	]));
	const storeC = storage.createStore(new Map(), [storeA]);
	const storeD = storage.createStore(new Map(), [storeA, storeB]);
	
	t.true(storage.equal(storeA, storeA));
	t.true(storage.equal(storeA, storeC));
	t.false(storage.equal(storeA, storeB));
	t.false(storage.equal(storeA, storeD));
	t.false(storage.equal(storeC, storeD));
});
