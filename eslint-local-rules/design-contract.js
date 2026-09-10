const viewportProperties = new Set([
	'innerWidth',
	'innerHeight',
	'outerWidth',
	'outerHeight',
	'width',
	'height',
	'availWidth',
	'availHeight',
	'orientation'
]);
const rootGeometryProperties = new Set([
	'clientWidth',
	'clientHeight',
	'offsetWidth',
	'offsetHeight',
	'scrollWidth',
	'scrollHeight'
]);
const globalViewportIdentifiers = new Set([
	'innerWidth',
	'innerHeight',
	'outerWidth',
	'outerHeight'
]);
const layoutFeature =
	/(?:^|[^a-z-])(?:min-|max-)?(?:device-)?(?:width|height|aspect-ratio|orientation)\b/i;
const ownedToken =
	/^--pksx-(?:height-band|type-(?:caption|label|body|title|display|editable)|(?:small-)?control-height)$/;
const heightBandLockProperty = 'pksxHeightBandLock';

function unwrapExpression(node) {
	while (
		['ChainExpression', 'TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression'].includes(
			node?.type
		)
	)
		node = node.expression;
	return node;
}

function staticString(node) {
	node = unwrapExpression(node);
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
		return node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? '';
	return null;
}

const globalKinds = new Map([
	['globalThis', 'window'],
	['window', 'window'],
	['self', 'window'],
	['screen', 'viewport'],
	['visualViewport', 'viewport'],
	['document', 'document'],
	['matchMedia', 'matchMedia'],
	['getComputedStyle', 'getComputedStyle']
]);

function isRoot(kind) {
	return kind === 'root' || kind === 'documentElement';
}

function staticBindings(context) {
	const values = new Map();
	const resolving = new Set();
	const variable = (node) => {
		for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
			const binding = scope.set.get(node.name);
			if (binding) return binding;
		}
		return null;
	};
	const propertyName = (node) =>
		!node.computed && node.property.type === 'Identifier'
			? node.property.name
			: (resolve(node.property)?.text ?? null);
	const member = (owner, key) => {
		if (key === 'style') return { kind: 'style' };
		if (owner?.kind === 'window') {
			if (['window', 'self', 'globalThis'].includes(key)) return { kind: 'window' };
			if (['screen', 'visualViewport'].includes(key)) return { kind: 'viewport' };
			if (['document', 'matchMedia', 'getComputedStyle'].includes(key)) return { kind: key };
		}
		if (owner?.kind === 'document') {
			if (['documentElement', 'scrollingElement'].includes(key)) return { kind: 'documentElement' };
			if (key === 'body') return { kind: 'root' };
		}
		if (owner?.kind === 'documentElement' && key === 'dataset') return { kind: 'rootDataset' };
		return null;
	};
	const resolve = (expression) => {
		const node = unwrapExpression(expression);
		const text = staticString(node);
		if (text !== null) return { text };
		if (node?.type === 'Identifier') {
			const binding = variable(node);
			const key = binding ?? node.name;
			if (values.has(key)) return values.get(key);
			if (binding?.defs.length) {
				const declaration = binding.defs.find((definition) => definition.type === 'Variable')?.node;
				if (!declaration?.init || resolving.has(binding)) return null;
				resolving.add(binding);
				bindValue(declaration.id, resolve(declaration.init));
				resolving.delete(binding);
				return values.get(binding) ?? null;
			}
			return { kind: globalKinds.get(node.name) };
		}
		if (node?.type === 'MemberExpression') return member(resolve(node.object), propertyName(node));
		if (node?.type === 'CallExpression') {
			if (resolve(node.callee)?.kind === 'getComputedStyle') return { kind: 'computedStyle' };
			const callee = unwrapExpression(node.callee);
			if (callee?.type === 'MemberExpression') {
				const kind = resolve(callee.object)?.kind;
				const method = propertyName(callee);
				if (
					(kind === 'computedStyle' &&
						method === 'getPropertyValue' &&
						resolve(node.arguments[0])?.text === '--pksx-height-band') ||
					(kind === 'inheritedHeightBand' && method === 'trim')
				)
					return { kind: 'inheritedHeightBand' };
			}
		}
		return null;
	};
	const bindValue = (pattern, value, onProperty) => {
		pattern = pattern?.type === 'AssignmentPattern' ? pattern.left : unwrapExpression(pattern);
		if (pattern?.type === 'Identifier') values.set(variable(pattern) ?? pattern.name, value);
		if (pattern?.type !== 'ObjectPattern') return;
		for (const property of pattern.properties) {
			if (property.type !== 'Property') continue;
			const key =
				!property.computed && property.key.type === 'Identifier'
					? property.key.name
					: resolve(property.key)?.text;
			onProperty?.(value?.kind, key, property);
			bindValue(property.value, member(value, key), onProperty);
		}
	};
	return {
		resolve,
		isGlobal: (node) => !variable(node)?.defs.length,
		propertyName,
		bindValue,
		bind: (pattern, source, onProperty) => bindValue(pattern, resolve(source), onProperty)
	};
}

const noResponsiveClassifier = {
	meta: {
		type: 'problem',
		docs: { description: 'Reject JavaScript viewport classifiers.' },
		messages: {
			viewport:
				'[RESP-1] viewport-classifier: Read element coordinates instead of classifying the viewport.',
			media: '[RESP-1] viewport-classifier: Layout-bearing matchMedia queries are forbidden.',
			root: '[RESP-1] viewport-classifier: Document-root geometry is viewport geometry.'
		},
		schema: []
	},
	create(context) {
		const bindings = staticBindings(context);
		const { resolve, propertyName } = bindings;
		const reportProperty = (kind, property, node) => {
			if (['window', 'viewport'].includes(kind) && viewportProperties.has(property))
				context.report({ node, messageId: 'viewport' });
			if (isRoot(kind) && rootGeometryProperties.has(property))
				context.report({ node, messageId: 'root' });
		};
		return {
			ImportDeclaration(node) {
				if (node.source.value !== 'svelte/reactivity') return;
				for (const specifier of node.specifiers) {
					if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'MediaQuery')
						bindings.bindValue(specifier.local, { kind: 'mediaQuery' });
				}
			},
			VariableDeclarator(node) {
				bindings.bind(node.id, node.init, reportProperty);
			},
			AssignmentExpression(node) {
				if (node.operator === '=') bindings.bind(node.left, node.right, reportProperty);
			},
			Identifier(node) {
				if (!globalViewportIdentifiers.has(node.name) || !bindings.isGlobal(node)) return;
				if (
					node.parent?.type === 'MemberExpression' &&
					node.parent.property === node &&
					!node.parent.computed
				)
					return;
				if (node.parent?.type === 'Property' && node.parent.key === node) return;
				context.report({ node, messageId: 'viewport' });
			},
			MemberExpression(node) {
				reportProperty(resolve(node.object)?.kind, propertyName(node), node);
			},
			CallExpression(node) {
				const callee = unwrapExpression(node.callee);
				if (
					callee?.type === 'MemberExpression' &&
					propertyName(callee) === 'getBoundingClientRect' &&
					isRoot(resolve(callee.object)?.kind)
				)
					context.report({ node, messageId: 'root' });
				if (resolve(callee)?.kind !== 'matchMedia') return;
				const query = resolve(node.arguments[0])?.text;
				if (query === undefined || layoutFeature.test(query))
					context.report({ node, messageId: 'media' });
			},
			NewExpression(node) {
				if (resolve(node.callee)?.kind === 'mediaQuery')
					context.report({ node, messageId: 'media' });
			},
			BinaryExpression(node) {
				const left = node.left.type === 'MemberExpression' ? propertyName(node.left) : null;
				const right = node.right.type === 'MemberExpression' ? propertyName(node.right) : null;
				if (
					(left === 'clientWidth' && right === 'clientHeight') ||
					(left === 'clientHeight' && right === 'clientWidth')
				)
					context.report({ node, messageId: 'viewport' });
			}
		};
	}
};

const noOwnedTokenWrites = {
	meta: {
		type: 'problem',
		docs: { description: 'Reject runtime writes to owned density tokens.' },
		messages: {
			token: '[DENSITY-1] token-owner: Runtime writes to owned density tokens are forbidden.',
			heightBand:
				'[RESP-1] height-band-owner: Runtime Height Band writes belong to the focus lock owner.'
		},
		schema: []
	},
	create(context) {
		const bindings = staticBindings(context);
		const { resolve, propertyName } = bindings;
		const filename = context.filename.replaceAll('\\', '/');
		const ownerFile =
			filename === 'src/lib/pksx/height-band-lock.ts' ||
			filename.endsWith('/src/lib/pksx/height-band-lock.ts');
		const isHeightBandLockTarget = (node) =>
			node?.type === 'MemberExpression' &&
			propertyName(node) === heightBandLockProperty &&
			resolve(node.object)?.kind === 'rootDataset';
		const canonicalOwnerWrite = (target, value, deleting = false) =>
			ownerFile &&
			isHeightBandLockTarget(target) &&
			(deleting || resolve(value)?.kind === 'inheritedHeightBand');
		const reportCssText = (node, expression) => {
			const text = resolve(expression)?.text;
			if (text === undefined) return;
			for (const declaration of text.split(';')) {
				const property = declaration.match(/^\s*(--[\w-]+)\s*:/)?.[1];
				if (property && ownedToken.test(property))
					context.report({
						node,
						messageId: property === '--pksx-height-band' ? 'heightBand' : 'token'
					});
			}
		};
		return {
			VariableDeclarator(node) {
				bindings.bind(node.id, node.init);
			},
			AssignmentExpression(node) {
				if (node.operator === '=') bindings.bind(node.left, node.right);
				if (isHeightBandLockTarget(node.left) && !canonicalOwnerWrite(node.left, node.right))
					context.report({ node, messageId: 'heightBand' });
				if (
					node.left.type === 'MemberExpression' &&
					propertyName(node.left) === 'cssText' &&
					resolve(node.left.object)?.kind === 'style'
				)
					reportCssText(node, node.right);
			},
			UnaryExpression(node) {
				if (
					node.operator === 'delete' &&
					isHeightBandLockTarget(node.argument) &&
					!canonicalOwnerWrite(node.argument, null, true)
				)
					context.report({ node, messageId: 'heightBand' });
			},
			CallExpression(node) {
				const callee = unwrapExpression(node.callee);
				if (callee?.type !== 'MemberExpression') return;
				const method = propertyName(callee);
				const key = resolve(node.arguments[0])?.text;
				const receiverKind = resolve(callee.object)?.kind;
				if (method === 'setProperty') {
					if (
						(key !== undefined && ownedToken.test(key)) ||
						(key === undefined && receiverKind === 'style')
					)
						context.report({
							node,
							messageId: key === '--pksx-height-band' ? 'heightBand' : 'token'
						});
				}
				if (
					['setAttribute', 'removeAttribute', 'toggleAttribute'].includes(method) &&
					receiverKind === 'documentElement' &&
					key === 'data-pksx-height-band-lock'
				)
					context.report({ node, messageId: 'heightBand' });
				if (method === 'setAttribute' && key === 'style') reportCssText(node, node.arguments[1]);
			}
		};
	}
};

export default {
	rules: {
		'no-responsive-classifier': noResponsiveClassifier,
		'no-owned-token-writes': noOwnedTokenWrites
	}
};
