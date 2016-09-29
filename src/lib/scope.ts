import * as ts from "typescript";

export function createScopeResolver(checker: ts.TypeChecker) {
	let nextId = 0;
	
	const idForNode = new WeakMap<ts.Node, number>();
	const idForSymbol = new WeakMap<ts.Symbol, number>();
	const idForThisScope = new WeakMap<ts.Node, number>();
	const rootId = getNextId();
	
	return { get, getSymbol, getDottedName };
	
	function get(node: ts.Node): number | undefined {
		const cached = idForNode.get(node);
		if (cached !== undefined) return  cached;
		
		if (node.kind === ts.SyntaxKind.ThisKeyword) {
			const scope = findThisScope(node);
			if (scope === undefined) {
				idForNode.set(node, rootId);
				return rootId;
			} else {
				return getIdInMap(node, idForThisScope, scope);
			}
		} else if (node.kind === ts.SyntaxKind.Identifier) {
			// TODO: Remove type cast
			// TypeScript API does not have nullabiltiy annotations yet.
			const symbol = <ts.Symbol | undefined> checker.getSymbolAtLocation(node);
			if (symbol === undefined) {
				return undefined;
			}
			return getIdInMap(node, idForSymbol, symbol);
		} else {
			return undefined;
		}
	}
	
	function getSymbol(symbol: ts.Symbol) {
		return getIdInMap(undefined, idForSymbol, symbol);
	}
	
	function getDottedName(node: ts.Node): string | undefined {
		if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
			const parent = getDottedName((<ts.PropertyAccessExpression>node).expression);
			if (parent !== undefined) {
				return parent + "." + (<ts.PropertyAccessExpression>node).name.text;
			}
			return undefined;
		}
		const id = get(node);
		if (id !== undefined) {
			return id.toString();
		}
		return undefined;
	}
	
	function getIdInMap<U>(node: ts.Node | undefined, map: WeakMap<U, number>, key: U) {
		const id = map.get(key);
		if (id !== undefined) return id;
		
		const newId = getNextId();
		if (node) idForNode.set(node, newId);
		map.set(key, newId);
		
		return newId;
	}
	
	function getNextId() {
		return nextId++;
	}
}

function findThisScope(location: ts.Node) {
	let node: ts.Node | undefined = location;
	while (node !== undefined) {
		switch (node.kind) {
			case ts.SyntaxKind.FunctionDeclaration:
			case ts.SyntaxKind.FunctionExpression:
			case ts.SyntaxKind.SetAccessor:
			case ts.SyntaxKind.GetAccessor:
			case ts.SyntaxKind.MethodDeclaration:
			case ts.SyntaxKind.ClassDeclaration:
			case ts.SyntaxKind.ModuleDeclaration:
				return node;
			case ts.SyntaxKind.SourceFile:
				if (ts.isExternalModule(<ts.SourceFile>node)) {
					return node;
				}
				return undefined;
			default:
				node = node.parent;
		}
	}
	throw new Error("End of findThisScope should be unreachable");
}
