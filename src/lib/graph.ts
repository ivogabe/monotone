import * as ts from "typescript";
import { Graph, GraphNode, GraphEdge, GraphNodeKind, Direction, FunctionGraph } from "./types";
import { toArray, isLogicalBinaryExpression } from "./utils";

const allKinds: GraphNodeKind[] = [
	GraphNodeKind.Begin,
	GraphNodeKind.End,
	GraphNodeKind.GuardTrue,
	GraphNodeKind.GuardFalse
];

export function createGraph(files: ts.SourceFile[]): Graph {
	const nodes: Map<ts.Node, GraphNode<ts.Node>>[] = [
		new Map(),
		new Map(),
		new Map(),
		new Map()
	];

	const functions = new Map<ts.FunctionLikeDeclaration, FunctionGraph>();

	let isFunctionStart = true;
	let flow: GraphNode<ts.Node> | undefined;
	let flowBreak: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowBreakLabel: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowContinue: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowContinueLabel: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowTry: GraphNode<ts.Node>[] | undefined;
	let currentFunction: FunctionGraph | undefined;

	for (const file of files) bindFile(file);

	return { get, edges, getFunction };

	function get<U extends ts.Node>(node: U, kind: GraphNodeKind): GraphNode<U> {
		if (kind == GraphNodeKind.Synthesized) {
			throw new Error("Cannot call `get` on synthesized node.")
		}
		return <GraphNode<U>>nodes[kind].get(node);
	}
	
	function edges(direction: Direction) {
		const result: GraphEdge<ts.Node, ts.Node>[] = [];
		function visitNode(node: ts.Node) {
			for (const kind of allKinds) {
				const graphNode = getNode(node, kind);
				for (const next of direction === Direction.Forward ? graphNode.next : graphNode.previous) {
					result.push([graphNode, next]);
				}
			}
			ts.forEachChild(node, visitNode);
		}
		for (const file of files) visitNode(file);
		return result;
	}

	function getFunction(node: ts.FunctionLikeDeclaration) {
		const graph = functions.get(node);
		if (graph === undefined) {
			throw new Error("Graph of function declaration not found");
		}
		return graph;
	}
	
	function synthesize(node: ts.Node) {
		return { node, kind: GraphNodeKind.Synthesized, previous: [], next: [] };
	}
	function getNode<U extends ts.Node>(node: U, kind: GraphNodeKind) {
		if (kind == GraphNodeKind.Synthesized) {
			throw new Error("Cannot call `getNode` on synthesized node.")
		}
		const map = nodes[kind];
		const value = map.get(node);
		if (value) return <GraphNode<U>>value;
		const newNode: GraphNode<U> = { node, kind, previous: [], next: [] };
		map.set(node, newNode);
		return newNode;
	}
	function getNodeBegin<U extends ts.Node>(node: U | undefined) {
		if (node === undefined) return undefined;
		return getNode(node, GraphNodeKind.Begin);
	}
	function getNodeEnd<U extends ts.Node>(node: U) {
		return getNode(node, GraphNodeKind.End);
	}
	function getNodeGuardTrue<U extends ts.Node>(node: U) {
		return getNode(node, GraphNodeKind.GuardTrue);
	}
	function getNodeGuardFalse<U extends ts.Node>(node: U) {
		return getNode(node, GraphNodeKind.GuardFalse);
	}
	
	function addEdge(to: GraphNode<ts.Node> | undefined) {
		if (to === undefined) return;
		if (flow !== undefined && flow !== to) {
			flow.next.push(to);
			to.previous.push(flow);
		}
		flow = to;
	}
	function addEdges(from: undefined | GraphNode<ts.Node> | GraphNode<ts.Node>[], to: undefined | GraphNode<ts.Node> | GraphNode<ts.Node>[]) {
		if (from === undefined || to === undefined) return;
		const saveFlow = flow;
		for (const f of toArray(from)) {
			for (const t of toArray(to)) {
				flow = f;
				addEdge(t);
			}
		}
		
		flow = saveFlow;
	}
	
	function bindFile(file: ts.SourceFile) {
		if (file.isDeclarationFile) return;
		bindContainerBody(file);
		currentFunction = undefined;
		visitNode(file);

		if (flow !== undefined) {
			const saveFlow = flow;
			for (const f of files) {
				if (file === f) continue;
				addEdge(getNodeBegin(f));
				flow = saveFlow;
			}
		}

		function visitNode(node: ts.Node) {
			let modifiesCurrentFunction = false;
			const saveCurrentFunction = currentFunction;
			switch (node.kind) {
				case ts.SyntaxKind.FunctionDeclaration:
				case ts.SyntaxKind.MethodDeclaration:
				case ts.SyntaxKind.FunctionExpression:
				case ts.SyntaxKind.ArrowFunction:
				case ts.SyntaxKind.GetAccessor:
				case ts.SyntaxKind.SetAccessor:
					if ((node as ts.FunctionLikeDeclaration).body === undefined) return false;
					modifiesCurrentFunction = true;
					currentFunction = {
						entry: getNode((node as ts.FunctionLikeDeclaration).body!, GraphNodeKind.Begin),
						exit: []
					};
					functions.set(node as ts.FunctionLikeDeclaration, currentFunction);
					bindContainerBody((<ts.FunctionLikeDeclaration>node).body);
					break;
				case ts.SyntaxKind.ClassDeclaration:
				case ts.SyntaxKind.ClassExpression:
					modifiesCurrentFunction = true;
					currentFunction = undefined;
					bindContainerBody(node);
					break;
				case ts.SyntaxKind.ModuleDeclaration:
					modifiesCurrentFunction = true;
					currentFunction = undefined;
					bindContainerBody((<ts.ModuleDeclaration>node).body);
					break;
			}
			ts.forEachChild(node, visitNode);
			if (modifiesCurrentFunction) {
				if (currentFunction && flow) {
					currentFunction.exit.push(flow);
				}
				currentFunction = saveCurrentFunction;
			}
		}
	}
	function bindContainerBody(body: ts.Node | undefined) {
		flow = undefined;
		flowBreak = undefined;
		flowBreakLabel = [];
		flowContinue = undefined;
		flowContinueLabel = [];
		bind(body);
	}
	function bind(node: ts.Node | undefined, trueTarget?: GraphNode<ts.Node>, falseTarget?: GraphNode<ts.Node>) {
		if (node === undefined) return;
		const begin = getNode(node, GraphNodeKind.Begin);
		addEdge(begin);
		let isDefault = false;
		switch (node.kind) {
			// Expressions
			case ts.SyntaxKind.PrefixUnaryExpression:
				if ((<ts.PrefixUnaryExpression>node).operator === ts.SyntaxKind.ExclamationToken) {
					bindUnaryNegateExpression(<ts.PrefixUnaryExpression>node, trueTarget, falseTarget);
				} else {
					bindDefault();
				}
				break;
			case ts.SyntaxKind.BinaryExpression:
				if (isLogicalBinaryExpression(<ts.BinaryExpression>node)) {
					bindLogicalBinaryExpression(<ts.BinaryExpression>node, trueTarget, falseTarget);
				} else {
					bindDefault();
				}
				break;
			case ts.SyntaxKind.ConditionalExpression:
				bindConditionalExpression(<ts.ConditionalExpression>node, trueTarget, falseTarget);
				break;
			// If & loop statements
			case ts.SyntaxKind.IfStatement:
				bindIf(<ts.IfStatement>node);
				break;
			case ts.SyntaxKind.WhileStatement:
				bindWhile(<ts.WhileStatement>node);
				break;
			case ts.SyntaxKind.ForStatement:
				bindFor(<ts.ForStatement>node);
				break;
			case ts.SyntaxKind.BreakStatement:
			case ts.SyntaxKind.ContinueStatement:
				bindBreakOrContinue(<ts.BreakOrContinueStatement>node);
				break;
			case ts.SyntaxKind.LabeledStatement:
				bindLabeledStatement(<ts.LabeledStatement>node);
				break;
			default:
				bindDefault();
				break;
		}
		const end = getNode(node, GraphNodeKind.End);
		addEdge(end);
		switch (node.kind) {
			case ts.SyntaxKind.ReturnStatement:
				if (currentFunction) {
					currentFunction.exit.push(end);
				}
				/* fall through */
			case ts.SyntaxKind.BreakStatement:
			case ts.SyntaxKind.ContinueStatement:
			case ts.SyntaxKind.ThrowStatement:
				flow = undefined;
				break;
		}
		if (isDefault) fallbackConditionFlow();
		
		function bindDefault() {
			bindChildren(node!);
			isDefault = true;
		}
		function fallbackConditionFlow() {
			if (flow === undefined) return;
			const saveFlow = flow;
			if (trueTarget) {
				const node = getNodeGuardTrue(flow.node);
				addEdge(node);
				addEdge(trueTarget);
				flow = saveFlow;
			}
			if (falseTarget) {
				const node = getNodeGuardFalse(flow.node);
				addEdge(node);
				addEdge(falseTarget);
				flow = saveFlow;
			}
		}
	}
	function bindChildren(node: ts.Node) {
		switch (node.kind) {
			case ts.SyntaxKind.FunctionDeclaration:
			case ts.SyntaxKind.MethodDeclaration:
			case ts.SyntaxKind.FunctionExpression:
			case ts.SyntaxKind.ArrowFunction:
			case ts.SyntaxKind.GetAccessor:
			case ts.SyntaxKind.SetAccessor:
			case ts.SyntaxKind.ClassDeclaration:
			case ts.SyntaxKind.ClassExpression:
			case ts.SyntaxKind.ModuleDeclaration:
				// These nodes get their own graph.
				// This is handled in `bindFile`.
				return;
		}
		ts.forEachChild(node, bind);
	}
	
	// Expressions
	function bindUnaryNegateExpression(node: ts.PrefixUnaryExpression, trueTarget?: GraphNode<ts.Node>, falseTarget?: GraphNode<ts.Node>) {
		bind(node.operand, falseTarget, trueTarget);
	}
	function bindLogicalBinaryExpression(node: ts.BinaryExpression, trueTarget?: GraphNode<ts.Node>, falseTarget?: GraphNode<ts.Node>) {
		const isAnd = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
		const rightBegin = getNodeBegin(node.right);
		const end = getNodeEnd(node);
		bind(
			node.left,
			isAnd ? rightBegin : falseTarget,
			!isAnd ? rightBegin : trueTarget
		);
		bind(node.right, trueTarget, falseTarget);
		addEdges([getNodeEnd(node.left), getNodeEnd(node.right)], getNodeEnd(node));
	}
	function bindConditionalExpression(node: ts.ConditionalExpression, trueTarget?: GraphNode<ts.Node>, falseTarget?: GraphNode<ts.Node>) {
		bind(node.condition, getNodeBegin(node.whenTrue), getNodeBegin(node.whenFalse));
		flow = undefined;
		bind(node.whenTrue, trueTarget, falseTarget);
		flow = undefined;
		bind(node.whenFalse, trueTarget, falseTarget);
		addEdges([getNodeEnd(node.whenTrue), getNodeEnd(node.whenFalse)], getNodeEnd(node));
	}
	
	// If & loop statements
	function bindLoopHelper(loop: ts.Node, start: GraphNode<ts.Node> | undefined) {
		const end = getNodeEnd(loop);
		//     v===================================\-----\
		// [start] --> [condition] --> [body] --> [flow]  \
		//                  |            v \-----> [continue]
		//                  \-> [end] <-[break]
		addEdge(start); // back flow
		addEdges(flowContinue, start); // continue flow
		addEdges(flowBreak, end); // break flow
		
		if (loop.parent!.kind === ts.SyntaxKind.LabeledStatement) {
			const label = (<ts.LabeledStatement>loop.parent).label;
			addEdges(filterLabelFlow(label, ts.SyntaxKind.ContinueStatement), start);
		}
		
		flow = end;
	}
	function bindIf(node: ts.IfStatement) {
		const elseNode = node.elseStatement ? getNodeBegin(node.elseStatement) : synthesize(node);
		bind(node.expression, getNodeBegin(node.thenStatement), elseNode);
		
		const end = getNodeEnd(node);
		flow = undefined;
		bind(node.thenStatement);
		const thenFlow = flow;
		if (node.elseStatement) {
			flow = undefined;
			bind(node.elseStatement);
		} else {
			flow = elseNode;
		}
		addEdge(end);
		flow = thenFlow;
		addEdge(end);
	}
	function bindWhile(node: ts.WhileStatement) {
		const end = getNodeEnd(node);
		bind(node.expression, getNodeBegin(node.statement), end);
		
		flow = undefined;
		bind(node.statement);
		bindLoopHelper(node, getNodeBegin(node.expression));
	}
	function bindFor(node: ts.ForStatement) {
		bind(node.initializer);
		
		const end = getNodeEnd(node);
		bind(node.condition, getNodeBegin(node.statement), end);
		
		flow = undefined;
		bind(node.statement);
		bindLoopHelper(node, getNodeBegin(node.incrementor));
		
		flow = undefined;
		bind(node.incrementor);
	}
	function bindLabeledStatement(node: ts.LabeledStatement) {
		bindChildren(node);
		
		// Only handle flow of `break` statements.
		// `continue` statements are handled in the binding of the loop
		const items = filterLabelFlow(node.label, ts.SyntaxKind.BreakStatement);
		const end = getNodeEnd(node);
		for (const item of items) {
			flow = item;
			addEdge(end);
		}
	}
	function bindBreakOrContinue(node: ts.BreakOrContinueStatement) {
		const list = node.kind === ts.SyntaxKind.BreakStatement
			? (node.label ? flowBreakLabel : flowBreak)
			: (node.label ? flowContinueLabel : flowContinue);
		if (list === undefined) return;
		list.push(getNodeEnd(node));
		flow = undefined;
	}
	
	// Helpers
	function filterLabelFlow(label: ts.Identifier, kind: ts.SyntaxKind) {
		const list = kind === ts.SyntaxKind.BreakStatement ? flowBreakLabel : flowContinueLabel;
		const rest: GraphNode<ts.BreakOrContinueStatement>[] = [];
		const result: GraphNode<ts.BreakOrContinueStatement>[] = [];
		for (const item of list || []) {
			if (item.node.label!.text === label.text) {
				result.push(item);
			} else {
				rest.push(item);
			}
		}
		if (kind === ts.SyntaxKind.BreakStatement) {
			flowBreakLabel = rest;
		} else {
			flowContinueLabel = rest;
		}
		return result;
	}
}
