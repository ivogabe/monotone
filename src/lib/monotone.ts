import * as ts from "typescript";
import { readFileSync } from "fs";
import * as path from "path";
import { createGraph } from "./graph";
import { iterableIsEmpty, Map2D } from "./utils";
import { Configuration, Graph, GraphNode, GraphEdge, GraphNodeKind, Direction, Instance, TransferResult, Jump, JumpBack } from "./types";

export function monotone<UState, UContext, UResult, UNode extends ts.Node>(configuration: (files: ts.SourceFile[], checker: ts.TypeChecker) => Configuration<UState, UContext, UResult, UNode>): Instance<UResult> {
	return (files, checker) => run(configuration(files, checker), createGraph(files));
}

const defaultOptions: ts.CompilerOptions = {
	target: ts.ScriptTarget.Latest,
	noResolve: true,
	noLib: true
};

function libFileName() {
	return path.resolve(require.resolve("typescript"), "../lib.d.ts");
}

export function runFiles<UResult>(instance: Instance<UResult>, addLib: boolean, files: ts.SourceFile[]) {
	if (addLib) {
		files = [ts.createSourceFile("__lib.d.ts", readFileSync(libFileName(), "utf8"), ts.ScriptTarget.Latest, true), ...files];
	}
	const host = {
		getSourceFile(fileName: string) {
			for (const file of files) {
				if (file.fileName === fileName) return file;
			}
			// TODO: Remove casts
			// TS lib doesn't have nullability annotations
			return <ts.SourceFile><any>undefined;
		},
		getDefaultLibFileName() {
			return "";
		},
		writeFile() {},
		getCurrentDirectory() {
			return "";
		},
		getCanonicalFileName(fileName: string) {
			return fileName;
		},
		useCaseSensitiveFileNames() {
			return true;
		},
		getNewLine() {
			return "\n";
		},
		fileExists(fileName: string) {
			// TODO: Remove cast
			return host.getSourceFile(fileName) !== <any>undefined
		},
		readFile(): any { // TODO: Remove type annotation
			return undefined;
		},
		getDirectories() {
			return [];
		}
	}
	const program = ts.createProgram(files.map(file => file.fileName), defaultOptions, host);
	const checker = program.getTypeChecker();
	
	return instance(files, checker);
}
export function runFile<UResult>(instance: Instance<UResult>, addLib: boolean, file: ts.SourceFile) {
	let files: ts.SourceFile[];
	return runFiles(instance, addLib, [file]);
}
export function runString<UResult>(instance: Instance<UResult>, addLib: boolean, source: string) {
	const file = ts.createSourceFile("untitled.ts", source, ts.ScriptTarget.Latest, true);
	return runFile(instance, addLib, file);
}

function run<UEnvironment, UContext, UResult, UNode extends ts.Node>(configuration: Configuration<UEnvironment, UContext, UResult, UNode>, graph: Graph): UResult {
	/**
	 * Represents start, end and, in case of a jump, the original start of the edge.
	 * If the edge a->b is replaced by a jump to function f, and f_end is an exit label of f,
	 * then [f_end, b, a] is the edge that represents the edge from the exit label to the call site.
	 */
	type Edge = [GraphNode<ts.Node>, UContext, GraphNode<ts.Node>, UContext, GraphNode<ts.Node> | undefined, UContext | undefined];

	let worklist: Edge[] = [];
	for (const [from, to] of graph.edges(configuration.direction)) {
		const fromContext = configuration.initialContexts(from);
		const toContext = configuration.initialContexts(to);
		for (const context of fromContext) {
			if (toContext.indexOf(context) !== -1) {
				worklist.push([from, context, to, context, undefined, undefined]);
			}
		}
	}
	if (configuration.direction === Direction.Forward) {
		// Reverse worklist
		worklist = worklist.map((value, index) => worklist[worklist.length - index - 1]);
	}
	
	const envs = Map2D<GraphNode<ts.Node>, UContext, UEnvironment>();
	// Jumps in configuration.direction
	const jumpTo = Map2D<GraphNode<ts.Node>, UContext, JumpBack<ts.Node, UContext>[]>();
	// Jumps in reverse direction
	const jumpBack = Map2D<GraphNode<ts.Node>, UContext, JumpBack<ts.Node, UContext>[]>();

	while (worklist.length !== 0) {
		const [from, fromContext, to, toContext, beforeJump, beforeJumpContext] = worklist.pop()!;
		const envFrom = get(from, fromContext);
		
		const envOut = get(to, toContext);
		const transferred = beforeJump ? transferMerge(beforeJump, from, get(beforeJump, beforeJumpContext!), transfer(from, fromContext, envFrom).env) : transfer(from, fromContext, envFrom);
		for (const jump of transferred.jumps) {
			const functionGraph = graph.getFunction(jump.to);
			if (configuration.direction === Direction.Forward) {
				const envJumpTo = get(functionGraph.entry, jump.toContext);
				const newEnvJumpTo = configuration.join(jump.env, envJumpTo);
				const transformed = configuration.join(envJumpTo, newEnvJumpTo);
				if (!configuration.equal(envJumpTo, transformed)) {
					set(functionGraph.entry, jump.toContext, transformed);
					addWork(functionGraph.entry, jump.toContext);

					if (envJumpTo === configuration.bottom) {
						// Add edges to worklist
						const visited = new Set<GraphNode<ts.Node>>();
						let visit = (node: GraphNode<ts.Node>) => {
							if (visited.has(node)) return;
							visited.add(node);
							for (const next of node.next) {
								worklist.push([node, toContext, next, toContext, undefined, undefined]);
								visit(next);
							}
						};
						visit(to);

						for (const exit of functionGraph.exit) {
							addJumpEdge(exit, jump.toContext, to, toContext, from, fromContext);
						}
					}
				}
			} else {
				throw new Error("Jumps not implemented for backward analysis");
			}
		}
		const transformed = configuration.join(
			transferred.env,
			envOut
		);
		if (configuration.equal(transformed, envOut)) continue;
		set(to, toContext, transformed);
		addWork(to, toContext);
	}
	
	return configuration.result(getState, contextsForNode);
	
	function addWork(node: GraphNode<ts.Node>, context: UContext) {
		for (const edge of successors(node, context)) {
			worklist.push(edge);
			const [, , to, toContext, original] = edge;
			if (original === undefined) {
				let jumps = jumpBack.get(node, context);
				if (jumps === undefined) continue;
				for (const jump of jumps) {
					if (jump.original === node && jump.originalContext === context) {
						worklist.push([jump.node, jump.context, to, toContext, undefined, undefined]);
					}
				}
			}
		}
	}
	function addJumpEdge(from: GraphNode<ts.Node>, fromContext: UContext, to: GraphNode<ts.Node>, toContext: UContext, original: GraphNode<ts.Node>, originalContext: UContext) {
		const fromEdges = jumpTo.getOrCreate(from, fromContext, []);
		for (const edge of fromEdges) {
			if (edge.node === to && edge.original === original && edge.context === toContext) {
				// Edge exists
				return;
			}
		}
		// Edge does not exist yet
		fromEdges.push({ node: to, context: toContext, original, originalContext });
		const toEdges = jumpBack.getOrCreate(to, toContext, []);
		toEdges.push({ node: from, context: fromContext, original, originalContext });
	}

	function transfer(graphNode: GraphNode<ts.Node>, context: UContext, env: UEnvironment) {
		return configuration.kinds.indexOf(graphNode.kind) !== -1 && configuration.filter(graphNode.node)
			? configuration.transfer(graphNode.node, graphNode.kind, context, env) : TransferResult<UContext, UEnvironment>(env);
	}
	function transferMerge(original: GraphNode<ts.Node>, from: GraphNode<ts.Node>, beforeEnv: UEnvironment, jumpEnv: UEnvironment) {
		if (configuration.transferMerge) {
			return TransferResult<UContext, UEnvironment>(configuration.transferMerge(original.node as UNode, original.kind, from.node, from.kind, beforeEnv, jumpEnv));
		}
		return TransferResult<UContext, UEnvironment>(jumpEnv);
	}
	
	function isEntry(node: GraphNode<ts.Node>) {
		if (configuration.isEntry) return configuration.isEntry(node);
		const predecessors = configuration.direction === Direction.Forward ? node.next : node.previous;
		return predecessors.length === 0;
	}
	function get(node: GraphNode<ts.Node>, context: UContext) {
		const stored = envs.get(node, context);
		if (stored !== undefined) return stored;
		const value = isEntry(node) ? configuration.entry(node) : configuration.bottom;
		envs.set(node, context, value);
		return value;
	}
	function set(node: GraphNode<ts.Node>, context: UContext, value: UEnvironment) {
		envs.set(node, context, value);
	}
	function getState(node: ts.Node, kind: GraphNodeKind, context: UContext, out: boolean) {
		const graphNode = graph.get(node, kind);
		const env = get(graphNode, context);
		if (out) return transfer(graphNode, context, env).env;
		return env;
	}
	function contextsForNode(node: ts.Node, kind: GraphNodeKind) {
		const graphNode = graph.get(node, kind);
		return envs.keysForKey(graphNode);
	}
	
	// Returns tuple with a predecessor and, in case of a jump, the original target of the edge (before adding jump)
	function* predecessors(node: GraphNode<ts.Node>, context: UContext): IterableIterator<Edge> {
		for (const n of configuration.direction === Direction.Backward ? node.next : node.previous) {
			yield [node, context, n, context, undefined, undefined];
		}
		for (const jump of jumpBack.get(node, context) || []) {
			yield [node, context, jump.node, jump.context, jump.original, jump.originalContext];
		}
	}
	function* successors(node: GraphNode<ts.Node>, context: UContext): IterableIterator<Edge> {
		for (const n of configuration.direction === Direction.Forward ? node.next : node.previous) {
			yield [node, context, n, context, undefined, undefined];
		}
		for (const jump of jumpTo.get(node, context) || []) {
			yield [node, context, jump.node, jump.context, jump.original, jump.originalContext];
		}
	}
}
