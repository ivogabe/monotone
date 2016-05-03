monotone
========
An implementation of the monotone framework for JavaScript

Install
-------
```
npm install monotone --save
```

Usage
-----
```javascript
import { monotone, runString, Direction } from "monotone";

const instance = monotone((files, checker) => {
	return {
		direction: Direction.Backward, // Or Direction.Forward
		
		bottom: undefined,             // Bottom value
		entry() {
			return undefined;          // Initial value for entry points
		},
		union(a, b) {
			return undefined;          // Combine two values
		},
		isLessOrEqual(a, b) {
			return true;               // Compare two value
		},
		
		kinds: [GraphNodeKind.Begin],  // The positions of nodes in the AST that have a transfer function
		filter(node) {
			return true;               // Filter nodes that have a transfer function
		}
		transfer(node, kind, state, get) {
			return state;              // The transfer function of the monotone framework
		},
		result(get) {
			return undefined;          // Extract the information from the final state
		}
	};
});
const result = runString(instance, `function(a, b) { return a + b }`);
```
You can find a complete example, which implement live variable analysis, in `src/test/monotone-example.ts`.

This project uses the TypeScript compiler for parsing and scope analysis, which can parse both JavaScript and TypeScript.

Build
-----
You can build this project with `npm run build` and test it with `npm test`.

License
-------
Monotone is licensed under the [MIT license](http://opensource.org/licenses/MIT).

