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

function staticString(node, aliases) {
	node = unwrapExpression(node);
	if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
	if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
		return node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? '';
	if (node?.type === 'Identifier') return aliases?.get(node.name) ?? null;
	return null;
}

function propertyName(node) {
	if (!node.computed && node.property.type === 'Identifier') return node.property.name;
	if (node.computed) return staticString(node.property);
	return null;
}

function isIdentifier(node, name) {
	return node?.type === 'Identifier' && node.name === name;
}

function isDocumentRoot(node, aliases, documentAliases = new Set(['document'])) {
	node = unwrapExpression(node);
	if (node?.type === 'Identifier' && aliases.has(node.name)) return true;
	if (node?.type !== 'MemberExpression') return false;
	const property = propertyName(node);
	return (
		node.object.type === 'Identifier' &&
		documentAliases.has(node.object.name) &&
		['documentElement', 'body', 'scrollingElement'].includes(property)
	);
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
		const viewportAliases = new Set(['globalThis', 'window', 'screen', 'visualViewport']);
		const documentAliases = new Set(['document']);
		const rootAliases = new Set();
		const mediaQueryConstructors = new Set();
		const stringAliases = new Map();
		const sourceKind = (source) => {
			source = unwrapExpression(source);
			if (source?.type === 'Identifier') {
				if (rootAliases.has(source.name)) return 'root';
				if (documentAliases.has(source.name)) return 'document';
				if (viewportAliases.has(source.name)) return 'viewport';
			}
			if (isDocumentRoot(source, rootAliases, documentAliases)) return 'root';
			if (
				source?.type === 'MemberExpression' &&
				source.object.type === 'Identifier' &&
				viewportAliases.has(source.object.name) &&
				['screen', 'visualViewport'].includes(propertyName(source))
			)
				return 'viewport';
			return null;
		};
		const bindKind = (pattern, kind) => {
			pattern = pattern?.type === 'AssignmentPattern' ? pattern.left : unwrapExpression(pattern);
			if (pattern?.type === 'Identifier') {
				viewportAliases.delete(pattern.name);
				documentAliases.delete(pattern.name);
				rootAliases.delete(pattern.name);
				if (kind === 'viewport') viewportAliases.add(pattern.name);
				if (kind === 'document') documentAliases.add(pattern.name);
				if (kind === 'root') rootAliases.add(pattern.name);
				return;
			}
			if (pattern?.type !== 'ObjectPattern' || !kind) return;
			for (const property of pattern.properties) {
				if (property.type !== 'Property') continue;
				const key =
					property.key.type === 'Identifier' ? property.key.name : staticString(property.key);
				if (!key) continue;
				if (kind === 'viewport' && viewportProperties.has(key))
					context.report({ node: property, messageId: 'viewport' });
				if (kind === 'root' && rootGeometryProperties.has(key))
					context.report({ node: property, messageId: 'root' });
				if (kind === 'viewport' && ['screen', 'visualViewport'].includes(key))
					bindKind(property.value, 'viewport');
				if (kind === 'document' && ['documentElement', 'body', 'scrollingElement'].includes(key))
					bindKind(property.value, 'root');
			}
		};
		const bind = (pattern, source) => bindKind(pattern, sourceKind(source));
		const bindString = (pattern, source) => {
			if (pattern?.type !== 'Identifier') return;
			const value = staticString(source, stringAliases);
			if (value === null) stringAliases.delete(pattern.name);
			else stringAliases.set(pattern.name, value);
		};

		return {
			ImportDeclaration(node) {
				if (node.source.value !== 'svelte/reactivity') return;
				for (const specifier of node.specifiers) {
					if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'MediaQuery') {
						mediaQueryConstructors.add(specifier.local.name);
					}
				}
			},
			VariableDeclarator(node) {
				bind(node.id, node.init);
				bindString(node.id, node.init);
			},
			AssignmentExpression(node) {
				if (node.operator === '=') {
					bind(node.left, node.right);
					bindString(node.left, node.right);
				}
			},
			Identifier(node) {
				if (!globalViewportIdentifiers.has(node.name)) return;
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
				const property = propertyName(node);
				if (!property) return;
				if (
					node.object.type === 'Identifier' &&
					viewportAliases.has(node.object.name) &&
					viewportProperties.has(property)
				) {
					context.report({ node, messageId: 'viewport' });
				}
				if (
					node.object.type === 'MemberExpression' &&
					isIdentifier(node.object.object, 'globalThis')
				) {
					const owner = propertyName(node.object);
					if (owner && viewportAliases.has(owner) && viewportProperties.has(property))
						context.report({ node, messageId: 'viewport' });
				}
				if (node.object.type === 'MemberExpression' && node.object.object.type === 'Identifier') {
					const owner = propertyName(node.object);
					if (
						viewportAliases.has(node.object.object.name) &&
						['screen', 'visualViewport'].includes(owner) &&
						viewportProperties.has(property)
					) {
						context.report({ node, messageId: 'viewport' });
					}
				}
				if (
					rootGeometryProperties.has(property) &&
					isDocumentRoot(node.object, rootAliases, documentAliases)
				) {
					context.report({ node, messageId: 'root' });
				}
			},
			CallExpression(node) {
				if (
					node.callee.type === 'MemberExpression' &&
					propertyName(node.callee) === 'getBoundingClientRect' &&
					isDocumentRoot(node.callee.object, rootAliases, documentAliases)
				) {
					context.report({ node, messageId: 'root' });
					return;
				}
				const direct = isIdentifier(node.callee, 'matchMedia');
				const member =
					node.callee.type === 'MemberExpression' && propertyName(node.callee) === 'matchMedia';
				if (!direct && !member) return;
				const query = staticString(node.arguments[0], stringAliases);
				if (query === null || layoutFeature.test(query)) {
					context.report({ node, messageId: 'media' });
				}
			},
			NewExpression(node) {
				if (node.callee.type === 'Identifier' && mediaQueryConstructors.has(node.callee.name)) {
					context.report({ node, messageId: 'media' });
				}
			},
			BinaryExpression(node) {
				const left = node.left.type === 'MemberExpression' ? propertyName(node.left) : null;
				const right = node.right.type === 'MemberExpression' ? propertyName(node.right) : null;
				if (
					(left === 'clientWidth' && right === 'clientHeight') ||
					(left === 'clientHeight' && right === 'clientWidth')
				) {
					context.report({ node, messageId: 'viewport' });
				}
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
		const stringAliases = new Map();
		const styleAliases = new Set();
		const rootAliases = new Set();
		const datasetAliases = new Set();
		const filename = context.filename.replaceAll('\\', '/');
		const ownerFile =
			filename === 'src/lib/pksx/height-band-lock.ts' ||
			filename.endsWith('/src/lib/pksx/height-band-lock.ts');
		const isDocumentElement = (node) =>
			(node?.type === 'Identifier' && rootAliases.has(node.name)) ||
			(node?.type === 'MemberExpression' &&
				propertyName(node) === 'documentElement' &&
				isIdentifier(node.object, 'document'));
		const bind = (target, source) => {
			source = unwrapExpression(source);
			if (target?.type === 'ObjectPattern') {
				for (const property of target.properties) {
					if (property.type !== 'Property') continue;
					const key =
						property.key.type === 'Identifier'
							? property.key.name
							: staticString(property.key, stringAliases);
					const value =
						property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
					if (value.type !== 'Identifier') continue;
					if (isIdentifier(source, 'document') && key === 'documentElement')
						rootAliases.add(value.name);
					if (isDocumentElement(source) && key === 'dataset') datasetAliases.add(value.name);
				}
				return;
			}
			if (target?.type !== 'Identifier') return;
			const value = staticString(source, stringAliases);
			if (value === null) stringAliases.delete(target.name);
			else stringAliases.set(target.name, value);
			const styleSource =
				(source?.type === 'MemberExpression' && propertyName(source) === 'style') ||
				(source?.type === 'Identifier' && styleAliases.has(source.name));
			if (styleSource) styleAliases.add(target.name);
			else styleAliases.delete(target.name);
			const rootSource = isDocumentElement(source);
			if (rootSource) rootAliases.add(target.name);
			else rootAliases.delete(target.name);
			const datasetSource =
				(source?.type === 'MemberExpression' &&
					propertyName(source) === 'dataset' &&
					isDocumentElement(source.object)) ||
				(source?.type === 'Identifier' && datasetAliases.has(source.name));
			if (datasetSource) datasetAliases.add(target.name);
			else datasetAliases.delete(target.name);
		};
		const isRootDataset = (node) => {
			node = unwrapExpression(node);
			return (
				(node?.type === 'Identifier' && datasetAliases.has(node.name)) ||
				(node?.type === 'MemberExpression' &&
					propertyName(node) === 'dataset' &&
					isDocumentElement(node.object))
			);
		};
		const isHeightBandLockTarget = (node) =>
			node?.type === 'MemberExpression' &&
			(!node.computed
				? node.property.type === 'Identifier' && node.property.name === heightBandLockProperty
				: staticString(node.property, stringAliases) === heightBandLockProperty) &&
			isRootDataset(node.object);
		const canonicalOwnerWrite = (target, value, deleting = false) =>
			ownerFile &&
			isHeightBandLockTarget(target) &&
			(deleting || (value?.type === 'Identifier' && value.name === 'band'));
		return {
			VariableDeclarator(node) {
				bind(node.id, node.init);
			},
			AssignmentExpression(node) {
				if (node.operator === '=') bind(node.left, node.right);
				if (isHeightBandLockTarget(node.left) && !canonicalOwnerWrite(node.left, node.right))
					context.report({ node, messageId: 'heightBand' });
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
				if (node.callee.type !== 'MemberExpression' || propertyName(node.callee) !== 'setProperty')
					return;
				const token = staticString(node.arguments[0], stringAliases);
				const receiver = node.callee.object;
				const protectedSink =
					(receiver.type === 'MemberExpression' && propertyName(receiver) === 'style') ||
					(receiver.type === 'Identifier' && styleAliases.has(receiver.name));
				if ((token !== null && ownedToken.test(token)) || (token === null && protectedSink)) {
					context.report({
						node,
						messageId: token === '--pksx-height-band' ? 'heightBand' : 'token'
					});
				}
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
