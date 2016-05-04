import { Node, SourceFile, TypeChecker } from "typescript";

export enum GraphNodeKind {
	Begin = 0,
	End = 1,
	GuardTrue = 2,
	GuardFalse = 3
}
export interface GraphNode<T extends Node> {
	kind: GraphNodeKind;
	node: T;
	previous: GraphNode<Node>[];
	next: GraphNode<Node>[];
}
export type GraphEdge<T extends Node, U extends Node> = [GraphNode<T>, GraphNode<U>];
export interface Graph {
	get<U extends Node>(node: U, kind: GraphNodeKind): GraphNode<U>;
	edges(direction: Direction): GraphEdge<Node, Node>[];
}

export enum Direction {
	Forward,
	Backward
}
export interface Configuration<TEnvironment, TResult, TNode extends Node> {
	direction: Direction;

	bottom: TEnvironment;
	entry(location: GraphNode<Node>): TEnvironment;
	join(a: TEnvironment, b: TEnvironment): TEnvironment;
	equal(a: TEnvironment, b: TEnvironment): boolean;

	kinds: GraphNodeKind[];
	filter(node: Node): node is TNode;
	transfer(node: TNode, kind: GraphNodeKind, state: TEnvironment): TEnvironment;

	result(get: (node: Node, kind: GraphNodeKind) => TEnvironment): TResult;
}
export type Instance<TResult> = (files: SourceFile[], checker: TypeChecker) => TResult;

