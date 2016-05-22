import test from "ava";
import * as ts from "typescript";
import { createScopeResolver } from "../lib/scope";
import { Direction, Configuration, GraphNode, GraphNodeKind } from "../lib/types";
import { monotone, runString } from "../lib/monotone";
import { setUnion, setCompare } from "../lib/utils";

function isIdentifier(node: ts.Node): node is ts.Identifier {
	return node.kind === ts.SyntaxKind.Identifier;
}
function isAssignmentTarget(node: ts.Node) {
	const { parent } = node;
	if (parent!.kind === ts.SyntaxKind.BinaryExpression) {
		return (<ts.BinaryExpression>parent).operatorToken.kind === ts.SyntaxKind.EqualsToken
			&& (<ts.BinaryExpression>parent).left === node;
	}
	if (parent!.kind === ts.SyntaxKind.VariableDeclaration) {
		return (<ts.VariableDeclaration>parent).name === node && (<ts.VariableDeclaration>parent).initializer !== undefined;
	}
	// Does not handle destructuring
	return false;
}

function getConfiguration(files: ts.SourceFile[], checker: ts.TypeChecker): Configuration<Set<number>, string[][], ts.Identifier> {
	const resolve = createScopeResolver(checker);
	
	return {
		direction: Direction.Backward,
		
		bottom: new Set(),
		entry: (location) => new Set(),
		join: setUnion,
		equal: setCompare,
		
		kinds: [GraphNodeKind.Begin],
		filter: isIdentifier,
		transfer,
		result
	};
	
	function transfer(node: ts.Identifier, kind: GraphNodeKind, state: Set<number>) {
		const result = new Set(state);
		const id = resolve.get(node);
		if (id !== undefined) {
			if (isAssignmentTarget(node)) {
				result.delete(id);
			} else {
				result.add(id);
			}
		}
		return result;
	}
	function result(get: (node: ts.Node, kind: GraphNodeKind) => Set<number>) {
		const list: string[][] = [];
		
		for (const file of files) {
			addOutput(file);
		}
		
		return list;
		
		function addOutput(node: ts.Node) {
			if (node.kind === ts.SyntaxKind.Identifier) {
				const symbol = checker.getSymbolAtLocation(node);
			}
			if (node.kind !== ts.SyntaxKind.DebuggerStatement) {
				ts.forEachChild(node, addOutput);
				return;
			}
			const state = get(node, GraphNodeKind.Begin);
			const variables = checker.getSymbolsInScope(node, ts.SymbolFlags.Variable);
			
			const live = variables.filter(symbol => {
				const id = resolve.getSymbol(symbol);
				if (id === undefined) return false;
				return state.has(id);
			}).map(symbol => symbol.name);
			list.push(live);
		}
	}
}

const instance = monotone(getConfiguration);

test("linear-flow", t => {
	const result = runString(instance, `
		function a() {
			let x, y;
			debugger;
			x = 1;
			debugger;
			y = x + 1;
			debugger;
			return y + 1;
		}
	`);
	t.deepEqual(result, [
		[],
		["x"],
		["y"]
	]);
});

test("condition", t => {
	const result = runString(instance, `
		function a() {
			let x, y, z;\
			debugger;
			if (x) {
				debugger;
				return y;
			} else {
				debugger;
				return z;
			}
		}
	`);
	t.deepEqual(result, [
		["x", "y", "z"],
		["y"],
		["z"]
	]);
});

test("loop", t => {
	const result = runString(instance, `
		function a() {
			let x, y, z;
			while (z) {
				debugger;
				x = y;
				debugger;
			}
			return x;
		}
	`);
	t.deepEqual(result, [
		["y", "z"],
		["x", "y", "z"]
	]);
});
