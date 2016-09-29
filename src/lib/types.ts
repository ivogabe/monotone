import { Node, FunctionLikeDeclaration, SourceFile, TypeChecker } from "typescript";

export enum GraphNodeKind {
	Begin = 0,
	End = 1,
	GuardTrue = 2,
	GuardFalse = 3,
	Synthesized = 4
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
	getFunction(node: FunctionLikeDeclaration): FunctionGraph;
}
export interface FunctionGraph {
	entry: GraphNode<Node>;
	exit: GraphNode<Node>[];
}

export class Jump<TContext, TEnvironment> {
	constructor(
		public to: FunctionLikeDeclaration,
		public toContext: TContext,
		public env: TEnvironment
	) {}
}
export interface JumpBack<T extends Node, TContext> {
	original: GraphNode<T>;
	originalContext: TContext;
	node: GraphNode<T>;
	context: TContext;
}

export interface TransferResult<TContext, TEnvironment> {
	env: TEnvironment;
	jumps: Jump<TContext, TEnvironment>[];
}
export function TransferResult<UContext, UEnvironment>(env: UEnvironment, jumps: Jump<UContext, UEnvironment>[] = []): TransferResult<UContext, UEnvironment> {
	return { env, jumps };
}

export enum Direction {
	Forward,
	Backward
}
export interface Configuration<TEnvironment, TContext, TResult, TNode extends Node> {
	direction: Direction;

	initialContexts(location: GraphNode<Node>): TContext[];

	bottom: TEnvironment;
	isEntry?(location: GraphNode<Node>): boolean;
	entry(location: GraphNode<Node>): TEnvironment;
	join(a: TEnvironment, b: TEnvironment): TEnvironment;
	equal(a: TEnvironment, b: TEnvironment): boolean;

	kinds: GraphNodeKind[];
	filter(node: Node): node is TNode;
	transfer(node: TNode, kind: GraphNodeKind, context: TContext, env: TEnvironment): TransferResult<TContext, TEnvironment>;
	transferMerge?(node: TNode, kind: GraphNodeKind, from: Node, fromKind: GraphNodeKind, beforeEnv: TEnvironment, jumpEnv: TEnvironment): TEnvironment;

	result(
		get: (node: Node, kind: GraphNodeKind, context: TContext, out: boolean) => TEnvironment,
		contexts: (node: Node, kind: GraphNodeKind) => Iterable<TContext>
	): TResult;
}
export type Instance<TResult> = (files: SourceFile[], checker: TypeChecker) => TResult;

