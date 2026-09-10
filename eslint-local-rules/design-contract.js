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
	/^--pksx-(?:type-(?:caption|label|body|title|display|editable)|(?:small-)?control-height)$/;

function propertyName(node) {
	if (!node.computed && node.property.type === 'Identifier') return node.property.name;
	if (node.computed && node.property.type === 'Literal') return String(node.property.value);
	return null;
}

function isIdentifier(node, name) {
	return node?.type === 'Identifier' && node.name === name;
}

function isDocumentRoot(node, aliases) {
	if (node?.type === 'Identifier' && aliases.has(node.name)) return true;
	if (node?.type !== 'MemberExpression') return false;
	const property = propertyName(node);
	return (
		isIdentifier(node.object, 'document') &&
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
		const rootAliases = new Set();
		const mediaQueryConstructors = new Set();

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
				if (node.id.type === 'Identifier') {
					if (node.init?.type === 'Identifier' && viewportAliases.has(node.init.name))
						viewportAliases.add(node.id.name);
					if (
						node.init?.type === 'MemberExpression' &&
						node.init.object.type === 'Identifier' &&
						viewportAliases.has(node.init.object.name) &&
						['screen', 'visualViewport'].includes(propertyName(node.init))
					) {
						viewportAliases.add(node.id.name);
					}
					if (isDocumentRoot(node.init, rootAliases)) rootAliases.add(node.id.name);
				}
				if (
					node.id.type === 'ObjectPattern' &&
					node.init?.type === 'Identifier' &&
					viewportAliases.has(node.init.name)
				) {
					for (const property of node.id.properties) {
						if (property.type !== 'Property' || property.key.type !== 'Identifier') continue;
						if (viewportProperties.has(property.key.name))
							context.report({ node: property, messageId: 'viewport' });
						if (
							['screen', 'visualViewport'].includes(property.key.name) &&
							property.value.type === 'Identifier'
						)
							viewportAliases.add(property.value.name);
					}
				}
				if (node.id.type === 'ObjectPattern' && isIdentifier(node.init, 'document')) {
					for (const property of node.id.properties) {
						if (
							property.type === 'Property' &&
							property.key.type === 'Identifier' &&
							['documentElement', 'body', 'scrollingElement'].includes(property.key.name) &&
							property.value.type === 'Identifier'
						)
							rootAliases.add(property.value.name);
					}
				}
				if (node.id.type === 'ObjectPattern' && isDocumentRoot(node.init, rootAliases)) {
					for (const property of node.id.properties) {
						if (
							property.type === 'Property' &&
							property.key.type === 'Identifier' &&
							rootGeometryProperties.has(property.key.name)
						)
							context.report({ node: property, messageId: 'root' });
					}
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
				if (rootGeometryProperties.has(property) && isDocumentRoot(node.object, rootAliases)) {
					context.report({ node, messageId: 'root' });
				}
			},
			CallExpression(node) {
				if (
					node.callee.type === 'MemberExpression' &&
					propertyName(node.callee) === 'getBoundingClientRect' &&
					isDocumentRoot(node.callee.object, rootAliases)
				) {
					context.report({ node, messageId: 'root' });
					return;
				}
				const direct = isIdentifier(node.callee, 'matchMedia');
				const member =
					node.callee.type === 'MemberExpression' && propertyName(node.callee) === 'matchMedia';
				if (!direct && !member) return;
				const query = node.arguments[0];
				if (
					!query ||
					query.type !== 'Literal' ||
					typeof query.value !== 'string' ||
					layoutFeature.test(query.value)
				) {
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
			token: '[DENSITY-1] token-owner: Runtime writes to owned density tokens are forbidden.'
		},
		schema: []
	},
	create(context) {
		const tokenAliases = new Set();
		return {
			VariableDeclarator(node) {
				if (node.id.type !== 'Identifier') return;
				if (
					node.init?.type === 'Literal' &&
					typeof node.init.value === 'string' &&
					ownedToken.test(node.init.value)
				)
					tokenAliases.add(node.id.name);
				if (node.init?.type === 'Identifier' && tokenAliases.has(node.init.name))
					tokenAliases.add(node.id.name);
			},
			CallExpression(node) {
				if (node.callee.type !== 'MemberExpression' || propertyName(node.callee) !== 'setProperty')
					return;
				const token = node.arguments[0];
				if (
					(token?.type === 'Literal' &&
						typeof token.value === 'string' &&
						ownedToken.test(token.value)) ||
					(token?.type === 'Identifier' && tokenAliases.has(token.name))
				) {
					context.report({ node, messageId: 'token' });
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
