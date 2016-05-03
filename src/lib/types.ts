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
export interface Configuration<TState, TResult, TNode extends Node> {
	direction: Direction;
	
	bottom: TState;
	entry(location: GraphNode<Node>): TState;
	join(a: TState, b: TState): TState;
	isLessOrEqual(a: TState, b: TState): boolean;
	
	kinds: GraphNodeKind[];
	filter(node: Node): node is TNode;
	transfer(node: TNode, kind: GraphNodeKind, state: TState, get: (node: Node, kind: GraphNodeKind) => TState): TState;
	
	result(get: (node: Node, kind: GraphNodeKind) => TState): TResult;
}
export type Instance<TResult> = (files: SourceFile[], checker: TypeChecker) => TResult;

