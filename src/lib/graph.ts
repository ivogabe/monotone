import * as ts from "typescript";
import { Graph, GraphNode, GraphEdge, GraphNodeKind, Direction } from "./types";
import { toArray, isLogicalBinaryExpression } from "./utils";

const allKinds: GraphNodeKind[] = [
	GraphNodeKind.Begin,
	GraphNodeKind.End,
	GraphNodeKind.GuardTrue,
	GraphNodeKind.GuardFalse
]

export function createGraph(files: ts.SourceFile[]): Graph {
	const nodes: Map<ts.Node, GraphNode<ts.Node>>[] = [
		new Map<ts.Node, GraphNode<ts.Node>>(),
		new Map<ts.Node, GraphNode<ts.Node>>(),
		new Map<ts.Node, GraphNode<ts.Node>>(),
		new Map<ts.Node, GraphNode<ts.Node>>()
	];

	let flow: GraphNode<ts.Node> | undefined;
	let flowBreak: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowBreakLabel: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowContinue: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowContinueLabel: GraphNode<ts.BreakOrContinueStatement>[] | undefined;
	let flowTry: GraphNode<ts.Node>[] | undefined;

	for (const file of files) bindFile(file!); // TODO: Remove cast

	return { get, edges };

	function get<U extends ts.Node>(node: U, kind: GraphNodeKind): GraphNode<U> {
		return <GraphNode<U>>nodes[kind].get(node);
	}
	
	function edges(direction: Direction) {
		const result: GraphEdge<ts.Node, ts.Node>[] = [];
		function visitNode(node: ts.Node) {
			for (const kind of allKinds) {
				const graphNode = getNode(node, kind!); // TODO: Remove cast
				for (const next of direction === Direction.Forward ? graphNode.next : graphNode.previous) {
					result.push([graphNode, next!]); // TODO: Remove cast
				}
			}
			ts.forEachChild(node, visitNode);
		}
		for (const file of files) visitNode(file!); // TODO: Remove cast
		return result;
	}
	
	function getNode<U extends ts.Node>(node: U, kind: GraphNodeKind) {
		const map = nodes[kind];
		const value = map.get(node);
		if (value) return <GraphNode<U>>value;
		const newNode: GraphNode<U> = { node, kind, previous: [], next: [] }
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
		bindContainerBody(file);
		visitNode(file);
		function visitNode(node: ts.Node) {
			switch (node.kind) {
				case ts.SyntaxKind.FunctionDeclaration:
				case ts.SyntaxKind.MethodDeclaration:
				case ts.SyntaxKind.FunctionExpression:
				case ts.SyntaxKind.ArrowFunction:
				case ts.SyntaxKind.GetAccessor:
				case ts.SyntaxKind.SetAccessor:
					bindContainerBody((<ts.FunctionLikeDeclaration>node).body);
					break;
				case ts.SyntaxKind.ClassDeclaration:
				case ts.SyntaxKind.ClassExpression:
					for (const member of (<ts.ClassLikeDeclaration>node).members) {
						bindContainerBody(member);
					}
					break;
				case ts.SyntaxKind.ModuleDeclaration:
					bindContainerBody((<ts.ModuleDeclaration>node).body);
					break;
			}
			ts.forEachChild(node, visitNode);
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
			case ts.SyntaxKind.BreakStatement:
			case ts.SyntaxKind.ContinueStatement:
			case ts.SyntaxKind.ThrowStatement:
			flow = undefined;
		}
		
		function bindDefault() {
			bindChildren(node!);
			fallbackConditionFlow();
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
		bind(node.expression, getNodeBegin(node.thenStatement), getNodeBegin(node.elseStatement));
		
		const end = getNodeEnd(node);
		flow = undefined;
		bind(node.thenStatement);
		const thenFlow = flow;
		flow = undefined;
		bind(node.elseStatement);
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
			// TODO: Remove cast (item!), see https://github.com/Microsoft/TypeScript/issues/8357
			if (item!.node.label!.text === label.text) {
				result.push(item!);
			} else {
				rest.push(item!);
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
