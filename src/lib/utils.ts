import { SyntaxKind, BinaryExpression } from "typescript";

export function toArray<U>(value: U | U[]) {
	if (value instanceof Array) {
		return value;
	} else {
		return [value];
	}
}
export function isLogicalBinaryExpression(node: BinaryExpression) {
	switch (node.operatorToken.kind) {
		case SyntaxKind.AmpersandAmpersandToken:
		case SyntaxKind.BarBarToken:
			return true;
		default:
			return false;
	}
}
