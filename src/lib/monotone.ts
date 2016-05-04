import * as ts from "typescript";
import { createGraph } from "./graph";
import { Configuration, Graph, GraphNode, GraphEdge, GraphNodeKind, Direction, Instance } from "./types";

export function monotone<UState, UResult, UNode extends ts.Node>(configuration: (files: ts.SourceFile[], checker: ts.TypeChecker) => Configuration<UState, UResult, UNode>): Instance<UResult> {
	return (files, checker) => run(configuration(files, checker), createGraph(files));
}

const defaultOptions: ts.CompilerOptions = {
	target: ts.ScriptTarget.Latest,
	// noResolve: true,
	noLib: true
};

export function runFiles<UResult>(instance: Instance<UResult>, files: ts.SourceFile[]) {
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
		}
	}
	const program = ts.createProgram(files.map(file => file.fileName), defaultOptions, host);
	const checker = program.getTypeChecker();
	
	return instance(files, checker);
}
export function runFile<UResult>(instance: Instance<UResult>, file: ts.SourceFile) {
	return runFiles(instance, [file]);
}
export function runString<UResult>(instance: Instance<UResult>, source: string) {
	const file = ts.createSourceFile("untitled.ts", source, ts.ScriptTarget.Latest, true);
	return runFile(instance, file);
}

function run<UState, UResult, UNode extends ts.Node>(configuration: Configuration<UState, UResult, UNode>, graph: Graph): UResult {
	const worklist = graph.edges(configuration.direction);
	const stateAtNode = new Map<GraphNode<ts.Node>, UState>();
	while (worklist.length !== 0) {
		const [from, to] = worklist.pop()!;
		const before = get(from);
		const after = get(to);
		const transformed = configuration.join(
			configuration.kinds.indexOf(from.kind) !== -1 && configuration.filter(from.node)
				? configuration.transfer(from.node, from.kind, before) : before,
			after
		);
		
		if (configuration.equal(transformed, after)) {
			continue;
		}
		
		set(to, transformed);
		for (const next of successors(to)) {
			worklist.push([to, next]);
		}
	}
	
	return configuration.result(getState);
	
	function get(node: GraphNode<ts.Node>) {
		const stored = stateAtNode.get(node);
		if (stored !== undefined) return stored;
		const value = predecessors(node).length === 0 ? configuration.entry(node) : configuration.bottom;
		stateAtNode.set(node, value);
		return value;
	}
	function set(node: GraphNode<ts.Node>, value: UState) {
		stateAtNode.set(node, value);
	}
	function getState(node: ts.Node, kind: GraphNodeKind) {
		const graphNode = graph.get(node, kind);
		return get(graphNode);
	}
	
	function predecessors(node: GraphNode<ts.Node>) {
		return configuration.direction === Direction.Forward ? node.previous : node.next;
	}
	function successors(node: GraphNode<ts.Node>) {
		return configuration.direction === Direction.Forward ? node.next : node.previous;
	}
}
