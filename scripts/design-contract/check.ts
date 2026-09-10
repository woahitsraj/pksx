import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';

export type ContractId = 'RESP-1' | 'DENSITY-1';

export interface DesignContractDiagnostic {
	contract: ContractId;
	name:
		| 'viewport-query'
		| 'viewport-classifier'
		| 'height-band-owner'
		| 'viewport-variant'
		| 'token-owner'
		| 'type-token'
		| 'editable-floor'
		| 'control-owner';
	path: string;
	offset: number;
	message: string;
}

type AstNode = {
	type?: string;
	start?: number;
	end?: number;
	name?: string;
	property?: string;
	value?: unknown;
	prelude?: unknown;
	block?: unknown;
	attributes?: unknown;
	[key: string]: unknown;
};

type ElementRecord = {
	tag: string;
	id: string | null;
	classes: Set<string>;
	ancestors: ElementIdentity[];
	category: string | null;
	editable: boolean;
	offset: number;
};

type ElementIdentity = Pick<ElementRecord, 'tag' | 'id' | 'classes'>;

const layoutFeatures =
	/(?:^|[^a-z-])(?:min-|max-)?(?:device-)?(?:width|height|aspect-ratio|orientation)\b/i;
const viewportVariant =
	/(?<![@\w-])(?:(?:sm|md|lg|xl|2xl|max-[^:\s]+|min-[^:\s]+|portrait|landscape|\[@media[^\]]*\]):)/;
const viewportVariantName = /^(?:sm|md|lg|xl|2xl|portrait|landscape|min-|max-|\[@media)/;
const typeToken =
	/^var\(--pksx-(?:type-(?:caption|label|body|title|display|editable)|(?:small-)?icon-size)\)$/;
const canonicalEditable = /^max\(16px,\s*var\(--pksx-type-editable(?:,\s*16px)?\)\)$/;
const ownedTokens = new Set([
	'--pksx-type-caption',
	'--pksx-type-label',
	'--pksx-type-body',
	'--pksx-type-title',
	'--pksx-type-display',
	'--pksx-type-editable',
	'--pksx-control-height',
	'--pksx-small-control-height'
]);
const customCategories = new Set(['small', 'slot', 'card', 'icon-only', 'composition']);
const blockProperties = new Set([
	'height',
	'min-height',
	'max-height',
	'block-size',
	'min-block-size',
	'max-block-size'
]);

const baseValues = new Map([
	['--pksx-type-caption', '10px'],
	['--pksx-type-label', '12px'],
	['--pksx-type-body', '13px'],
	['--pksx-type-title', '16px'],
	['--pksx-type-display', '24px'],
	['--pksx-type-editable', '16px'],
	['--pksx-control-height', 'clamp(32px, 9.4cqh, 44px)'],
	['--pksx-small-control-height', 'clamp(24px, calc(var(--pksx-control-height) * 0.75), 33px)']
]);
const registeredValues = new Map([
	...baseValues,
	['--pksx-control-height', '32px'],
	['--pksx-small-control-height', '24px']
]);
const largeValues = new Map([
	['--pksx-type-caption', '11px'],
	['--pksx-type-label', '13px'],
	['--pksx-type-body', '15px'],
	['--pksx-type-title', '18px'],
	['--pksx-type-display', '28px']
]);

function visit(
	value: unknown,
	callback: (node: AstNode, ancestors: readonly AstNode[]) => void,
	ancestors: AstNode[] = []
) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) visit(item, callback, ancestors);
		return;
	}
	const node = value as AstNode;
	if (typeof node.type === 'string') callback(node, ancestors);
	const next = typeof node.type === 'string' ? [...ancestors, node] : ancestors;
	for (const [key, child] of Object.entries(node)) {
		if (key === 'loc' || key === 'name_loc') continue;
		if (child && typeof child === 'object') visit(child, callback, next);
	}
}

function textFor(source: string, node: AstNode) {
	return typeof node.start === 'number' && typeof node.end === 'number'
		? source.slice(node.start, node.end)
		: String(node.prelude ?? '');
}

function staticAttribute(node: AstNode, name: string): string | null {
	const attributes = Array.isArray(node.attributes) ? (node.attributes as AstNode[]) : [];
	const attribute = attributes.find((item) => item.type === 'Attribute' && item.name === name);
	if (!attribute) return null;
	if (attribute.value === true) return '';
	if (!Array.isArray(attribute.value) || attribute.value.length !== 1) return null;
	const value = attribute.value[0] as AstNode;
	return value.type === 'Text' && typeof value.data === 'string' ? value.data : null;
}

function literalStrings(value: unknown, output: string[] = []): string[] {
	if (!value || typeof value !== 'object') return output;
	if (Array.isArray(value)) {
		for (const item of value) literalStrings(item, output);
		return output;
	}
	const node = value as AstNode;
	if (
		(node.type === 'Literal' || node.type === 'Text') &&
		typeof (node.value ?? node.data) === 'string'
	) {
		output.push(String(node.value ?? node.data));
	}
	if (node.type === 'TemplateElement' && node.value && typeof node.value === 'object') {
		const template = node.value as { cooked?: unknown; raw?: unknown };
		if (typeof (template.cooked ?? template.raw) === 'string') {
			output.push(String(template.cooked ?? template.raw));
		}
	}
	for (const [key, child] of Object.entries(node)) {
		if (key !== 'loc' && key !== 'name_loc' && child && typeof child === 'object') {
			literalStrings(child, output);
		}
	}
	return output;
}

function collectElements(ast: AstNode): ElementRecord[] {
	const elements: ElementRecord[] = [];
	const walk = (value: unknown, ancestors: ElementIdentity[]) => {
		if (!value || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const item of value) walk(item, ancestors);
			return;
		}
		const node = value as AstNode;
		if (node.type !== 'RegularElement') {
			for (const [key, child] of Object.entries(node)) {
				if (['attributes', 'expression', 'metadata', 'css', 'js', 'loc', 'name_loc'].includes(key))
					continue;
				if (child && typeof child === 'object') walk(child, ancestors);
			}
			return;
		}
		const tag = node.name ?? '';
		const attributes = Array.isArray(node.attributes) ? (node.attributes as AstNode[]) : [];
		const classAttribute = attributes.find(
			(item) => item.type === 'Attribute' && item.name === 'class'
		);
		const classes = new Set(
			literalStrings(classAttribute?.value).flatMap((value) => value.split(/\s+/).filter(Boolean))
		);
		for (const attribute of attributes) {
			if (attribute.type === 'ClassDirective' && attribute.name) classes.add(attribute.name);
		}
		const hasContenteditable = attributes.some(
			(attribute) => attribute.type === 'Attribute' && attribute.name === 'contenteditable'
		);
		const contenteditable = staticAttribute(node, 'contenteditable');
		const inputType = staticAttribute(node, 'type');
		const editable =
			(tag === 'input' &&
				!['button', 'checkbox', 'file', 'hidden', 'radio', 'reset', 'submit'].includes(
					inputType ?? ''
				)) ||
			tag === 'select' ||
			tag === 'textarea' ||
			(hasContenteditable && contenteditable?.toLowerCase() !== 'false');
		const identity = { tag, id: staticAttribute(node, 'id'), classes };
		if (['button', 'input', 'select', 'textarea'].includes(tag) || editable) {
			elements.push({
				...identity,
				ancestors,
				category: staticAttribute(node, 'data-pksx-control-category'),
				editable,
				offset: node.start ?? 0
			});
		}
		walk(node.fragment, [...ancestors, identity]);
	};
	walk(ast.fragment, []);
	return elements;
}

function isCanonicalHeightBandMedia(filePath: string, node: AstNode, cssSource: string) {
	if (filePath !== 'src/routes/layout.css') return false;
	const prelude = String(node.prelude ?? '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
	if (prelude !== '(min-height: 560px)') return false;
	const children = Array.isArray((node.block as AstNode | undefined)?.children)
		? (((node.block as AstNode).children as AstNode[]) ?? [])
		: [];
	if (children.length !== 1 || children[0]?.type !== 'Rule') return false;
	const rule = children[0];
	const declarations = Array.isArray((rule.block as AstNode | undefined)?.children)
		? (((rule.block as AstNode).children as AstNode[]) ?? [])
		: [];
	return (
		textFor(cssSource, rule.prelude as AstNode).trim() === ':root' &&
		declarations.length === 1 &&
		declarations[0]?.type === 'Declaration' &&
		declarations[0].property === '--pksx-height-band' &&
		String(declarations[0].value).trim() === 'tall'
	);
}

function selectorListMatchesIdentity(selectorList: AstNode, identity: ElementIdentity): boolean {
	const complexes = Array.isArray(selectorList.children)
		? (selectorList.children as AstNode[])
		: [];
	return complexes.some((complex) => {
		const relatives = Array.isArray(complex.children) ? (complex.children as AstNode[]) : [];
		const subject = relatives.at(-1);
		return subject ? compoundMatchesIdentity(subject, identity) : false;
	});
}

function containsIdentitySelector(selectorList: AstNode) {
	let found = false;
	visit(selectorList, (node) => {
		if (['TypeSelector', 'ClassSelector', 'IdSelector'].includes(node.type ?? '')) found = true;
	});
	return found;
}

function cssTokens(value: string) {
	const tokens: string[] = [];
	let current = '';
	let depth = 0;
	let quote = '';
	for (const character of value) {
		if (quote) {
			current += character;
			if (character === quote) quote = '';
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			current += character;
			continue;
		}
		if (character === '(') depth += 1;
		if (character === ')') depth -= 1;
		if (depth === 0 && (character === '/' || /\s/.test(character))) {
			if (current) tokens.push(current);
			if (character === '/') tokens.push(character);
			current = '';
			continue;
		}
		current += character;
	}
	if (current) tokens.push(current);
	return tokens;
}

function fontSizeFromShorthand(value: string) {
	if (value === 'inherit') return 'inherit';
	const tokens = cssTokens(value);
	const slash = tokens.indexOf('/');
	const candidates = slash === -1 ? tokens : tokens.slice(0, slash);
	return (
		candidates.find(
			(token) =>
				typeToken.test(token) ||
				canonicalEditable.test(token) ||
				/^(?:\d*\.?\d+(?:%|[a-z]+)|(?:calc|clamp|max|min)\(|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)/i.test(
					token
				)
		) ?? null
	);
}

function compoundMatchesIdentity(compound: AstNode, identity: ElementIdentity) {
	const selectors = Array.isArray(compound.selectors) ? (compound.selectors as AstNode[]) : [];
	for (const selector of selectors) {
		if (selector.type === 'TypeSelector' && selector.name !== '*' && selector.name !== identity.tag)
			return false;
		if (selector.type === 'ClassSelector' && !identity.classes.has(selector.name ?? ''))
			return false;
		if (selector.type === 'IdSelector' && selector.name !== identity.id) return false;
		if (
			selector.type === 'PseudoClassSelector' &&
			['global', 'is', 'where'].includes(selector.name ?? '')
		) {
			if (!selector.args || !selectorListMatchesIdentity(selector.args as AstNode, identity))
				return false;
		}
		if (selector.type === 'PseudoClassSelector' && selector.name === 'not') {
			const args = selector.args as AstNode | undefined;
			if (args && containsIdentitySelector(args) && selectorListMatchesIdentity(args, identity))
				return false;
		}
	}
	return true;
}

function selectorMatches(selectorList: AstNode, element: ElementRecord) {
	const complexes = Array.isArray(selectorList.children)
		? (selectorList.children as AstNode[])
		: [];
	return complexes.some((complex) => {
		const relatives = Array.isArray(complex.children) ? (complex.children as AstNode[]) : [];
		const subject = relatives.at(-1);
		if (!subject || !compoundMatchesIdentity(subject, element)) return false;
		return relatives.slice(0, -1).every((relative) => {
			const selectors = Array.isArray(relative.selectors) ? (relative.selectors as AstNode[]) : [];
			if (
				selectors.some(
					(selector) => selector.type === 'PseudoClassSelector' && selector.name === 'global'
				)
			)
				return true;
			return element.ancestors.some((ancestor) => compoundMatchesIdentity(relative, ancestor));
		});
	});
}

function isOwnedTokenWriteAllowed(
	filePath: string,
	property: string,
	value: string,
	selector: string,
	ancestors: readonly AstNode[]
) {
	if (filePath !== 'src/routes/layout.css') return false;
	const atrules = ancestors.filter((node) => node.type === 'Atrule');
	const propertyRule = atrules.find((node) => node.name?.toLowerCase() === 'property');
	if (propertyRule && String(propertyRule.prelude).trim() === property) {
		return registeredValues.get(property) === value;
	}
	const container = atrules.find((node) => node.name?.toLowerCase() === 'container');
	if (selector.trim() !== '.pksx-density') return false;
	if (!container) return baseValues.get(property) === value;
	const prelude = String(container.prelude).replace(/\s+/g, ' ').trim();
	return (
		prelude === 'pksx-density (min-width: 900px) and (min-height: 700px)' &&
		largeValues.get(property) === value
	);
}

export function checkDesignContract(filePath: string, source: string): DesignContractDiagnostic[] {
	const diagnostics: DesignContractDiagnostic[] = [];
	const report = (
		contract: ContractId,
		name: DesignContractDiagnostic['name'],
		offset: number,
		message: string
	) => diagnostics.push({ contract, name, path: filePath, offset, message });
	if (filePath.endsWith('.html')) {
		for (const match of source.matchAll(/<link\b[^>]*\bmedia\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
			if (layoutFeatures.test(match[1] ?? ''))
				report(
					'RESP-1',
					'viewport-query',
					match.index,
					'Stylesheet media attributes cannot classify layout.'
				);
		}
		for (const match of source.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
			if (viewportVariant.test(match[1] ?? ''))
				report(
					'RESP-1',
					'viewport-variant',
					match.index,
					'Viewport Tailwind variants are forbidden.'
				);
		}
		return diagnostics;
	}
	let ast: AstNode;
	let css: AstNode | null;
	let cssSource = source;
	let cssOffset = 0;
	try {
		if (filePath.endsWith('.css')) {
			const prefix = '<style>';
			ast = parse(`${prefix}${source}</style>`, { modern: true }) as unknown as AstNode;
			css = ast.css as AstNode;
			cssSource = `${prefix}${source}</style>`;
			cssOffset = prefix.length;
		} else {
			ast = parse(source, { modern: true }) as unknown as AstNode;
			css = (ast.css as AstNode | null) ?? null;
		}
	} catch (error) {
		throw new Error(`Unable to parse ${filePath}: ${String(error)}`, { cause: error });
	}

	const elements = filePath.endsWith('.svelte') ? collectElements(ast) : [];
	const standardControlOwners = new Set<ElementRecord>();
	const smallControlOwners = new Set<ElementRecord>();
	const reportMissingControlOwners = () => {
		for (const element of elements) {
			if (element.category === 'small' && !smallControlOwners.has(element)) {
				report(
					'DENSITY-1',
					'control-owner',
					element.offset,
					'Small controls must derive a block dimension from --pksx-small-control-height.'
				);
			}
			if (!element.category && !standardControlOwners.has(element)) {
				report(
					'DENSITY-1',
					'control-owner',
					element.offset,
					'Standard controls require --pksx-control-height or an explicit custom category.'
				);
			}
		}
	};
	for (const element of elements) {
		if (element.category && !customCategories.has(element.category)) {
			report(
				'DENSITY-1',
				'control-owner',
				element.offset,
				`Unknown control category "${element.category}".`
			);
		}
	}

	if (filePath.endsWith('.svelte')) {
		visit(ast.fragment, (node) => {
			if (node.type === 'SvelteWindow') {
				const attributes = Array.isArray(node.attributes) ? (node.attributes as AstNode[]) : [];
				for (const attribute of attributes) {
					if (
						attribute.type === 'BindDirective' &&
						/^(?:inner|outer)(?:Width|Height)$/.test(attribute.name ?? '')
					) {
						report(
							'RESP-1',
							'viewport-classifier',
							attribute.start ?? node.start ?? 0,
							'Viewport dimension bindings are forbidden.'
						);
					}
				}
			}
			if (
				node.type === 'RegularElement' &&
				node.name === 'link' &&
				staticAttribute(node, 'media')
			) {
				const media = staticAttribute(node, 'media') ?? '';
				if (layoutFeatures.test(media))
					report(
						'RESP-1',
						'viewport-query',
						node.start ?? 0,
						'Stylesheet media attributes cannot classify layout.'
					);
			}
			if (node.type === 'RegularElement') {
				const attributes = Array.isArray(node.attributes) ? (node.attributes as AstNode[]) : [];
				const classAttribute = attributes.find(
					(item) => item.type === 'Attribute' && item.name === 'class'
				);
				for (const value of literalStrings(classAttribute?.value)) {
					if (viewportVariant.test(value))
						report(
							'RESP-1',
							'viewport-variant',
							classAttribute?.start ?? node.start ?? 0,
							'Viewport Tailwind variants are forbidden.'
						);
				}
			}
			if (node.type === 'StyleDirective') {
				const property = node.name ?? '';
				if (ownedTokens.has(property))
					report(
						'DENSITY-1',
						'token-owner',
						node.start ?? 0,
						`Inline writes to ${property} are forbidden.`
					);
				if (property === 'font-size' || blockProperties.has(property))
					report(
						'DENSITY-1',
						'control-owner',
						node.start ?? 0,
						`Inline ${property} bypasses semantic ownership.`
					);
			}
		});
		const markupEnd = css?.start ?? source.length;
		const markup = source.slice(0, markupEnd);
		for (const match of markup.matchAll(
			/style\s*=\s*["'][^"']*(--pksx-(?:type-[\w-]+|(?:small-)?control-height)|font-size|(?:min-|max-)?(?:block-size|height))\s*:/g
		)) {
			report(
				'DENSITY-1',
				'token-owner',
				match.index,
				'Literal inline styles cannot write owned density properties.'
			);
		}
	}

	if (!css) {
		reportMissingControlOwners();
		return diagnostics;
	}
	if (filePath === 'src/routes/layout.css') {
		const authorities: AstNode[] = [];
		visit(css, (node) => {
			if (
				node.type === 'Atrule' &&
				node.name?.toLowerCase() === 'media' &&
				isCanonicalHeightBandMedia(filePath, node, cssSource)
			)
				authorities.push(node);
		});
		if (authorities.length !== 1) {
			report(
				'RESP-1',
				'viewport-query',
				((authorities[1] ?? authorities[0])?.start ?? cssOffset) - cssOffset,
				'Exactly one structurally valid 560px Height Band authority is required.'
			);
		}
	}
	visit(css, (node, ancestors) => {
		if (node.type === 'Atrule') {
			const name = node.name?.toLowerCase();
			const prelude = String(node.prelude ?? '')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/\s+/g, ' ')
				.trim();
			if (name === 'media' && layoutFeatures.test(prelude)) {
				const canonical = isCanonicalHeightBandMedia(filePath, node, cssSource);
				if (!canonical)
					report(
						'RESP-1',
						'viewport-query',
						(node.start ?? 0) - cssOffset,
						`Layout media query "${prelude}" is forbidden.`
					);
			}
			if (name === 'custom-media' && layoutFeatures.test(prelude))
				report(
					'RESP-1',
					'viewport-query',
					(node.start ?? 0) - cssOffset,
					'Layout custom media is forbidden.'
				);
			if (name === 'import' && layoutFeatures.test(prelude))
				report(
					'RESP-1',
					'viewport-query',
					(node.start ?? 0) - cssOffset,
					'Media-bearing imports cannot classify layout.'
				);
			const variantName = prelude.split(/[\s(]/, 1)[0]?.toLowerCase() ?? '';
			const invalidTallDefinition =
				name === 'custom-variant' &&
				variantName === 'tall' &&
				!/\bstyle\(\s*--pksx-height-band\s*:\s*tall\s*\)/i.test(prelude);
			if (
				(name === 'apply' && viewportVariant.test(` ${prelude}`)) ||
				((name === 'variant' || name === 'custom-variant') &&
					(viewportVariantName.test(variantName) || invalidTallDefinition))
			) {
				report(
					'RESP-1',
					'viewport-variant',
					(node.start ?? 0) - cssOffset,
					'Viewport Tailwind variants are forbidden.'
				);
			}
		}
		if (node.type !== 'Declaration') return;
		const property = node.property ?? '';
		const value = String(node.value ?? '')
			.replace(/\s*!important\s*$/, '')
			.trim();
		const rule = [...ancestors].reverse().find((item) => item.type === 'Rule');
		const selector = rule?.prelude ? textFor(cssSource, rule.prelude as AstNode) : '';
		const offset = (node.start ?? 0) - cssOffset;

		if (property === '--pksx-height-band') {
			const media = ancestors.find(
				(item) => item.type === 'Atrule' && item.name?.toLowerCase() === 'media'
			);
			const allowed =
				filePath === 'src/routes/layout.css' &&
				((selector.trim() === ':root' && value === 'short' && !media) ||
					(selector.trim() === ':root' &&
						value === 'tall' &&
						String(media?.prelude).replace(/\s+/g, ' ').trim() === '(min-height: 560px)') ||
					(selector.trim() === ":root[data-pksx-height-band-lock='short']" &&
						value === 'short' &&
						!media) ||
					(selector.trim() === ":root[data-pksx-height-band-lock='tall']" &&
						value === 'tall' &&
						!media));
			if (!allowed)
				report(
					'RESP-1',
					'height-band-owner',
					offset,
					'Only the root Height Band authority and focus lock may assign this token.'
				);
		}
		if (
			ownedTokens.has(property) &&
			!isOwnedTokenWriteAllowed(filePath, property, value, selector, ancestors)
		) {
			report(
				'DENSITY-1',
				'token-owner',
				offset,
				`${property} must use its registered density owner and exact value.`
			);
		}
		if (property === 'font-size' && !typeToken.test(value) && !canonicalEditable.test(value)) {
			report(
				'DENSITY-1',
				'type-token',
				offset,
				`font-size must use one semantic type token, found "${value}".`
			);
		}
		const shorthandSize = property === 'font' ? fontSizeFromShorthand(value) : null;
		if (
			property === 'font' &&
			shorthandSize !== 'inherit' &&
			!(shorthandSize && (typeToken.test(shorthandSize) || canonicalEditable.test(shorthandSize)))
		) {
			report(
				'DENSITY-1',
				'type-token',
				offset,
				'Sized font shorthands must use a semantic type token.'
			);
		}
		const matched = rule?.prelude
			? elements.filter((element) => selectorMatches(rule.prelude as AstNode, element))
			: [];
		if (
			property === 'font-size' &&
			matched.some((element) => element.editable) &&
			!/^var\(--pksx-type-editable\)$/.test(value) &&
			!canonicalEditable.test(value)
		) {
			report(
				'DENSITY-1',
				'editable-floor',
				offset,
				'Editable controls must use the 16px editable token.'
			);
		}
		if (
			property === 'font' &&
			matched.some((element) => element.editable) &&
			shorthandSize !== 'inherit' &&
			shorthandSize !== 'var(--pksx-type-editable)' &&
			!(shorthandSize && canonicalEditable.test(shorthandSize))
		) {
			report(
				'DENSITY-1',
				'editable-floor',
				offset,
				'Editable font shorthands must use the 16px editable token.'
			);
		}
		if (blockProperties.has(property) && matched.length > 0) {
			if (value === 'var(--pksx-control-height)') {
				for (const element of matched) standardControlOwners.add(element);
				return;
			}
			if (value === 'var(--pksx-small-control-height)') {
				for (const element of matched) smallControlOwners.add(element);
				if (matched.some((element) => !['small', 'icon-only'].includes(element.category ?? '')))
					report(
						'DENSITY-1',
						'control-owner',
						offset,
						'Small controls require a small or icon-only control category.'
					);
				return;
			}
			if (matched.some((element) => !element.category || !customCategories.has(element.category))) {
				report(
					'DENSITY-1',
					'control-owner',
					offset,
					`Custom ${property} "${value}" requires an explicit control category.`
				);
			}
		}
	});
	reportMissingControlOwners();
	return diagnostics;
}

function location(source: string, offset: number) {
	const before = source.slice(0, Math.max(0, offset));
	const lines = before.split('\n');
	return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

async function sourceFiles(directory: string): Promise<string[]> {
	const output: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) output.push(...(await sourceFiles(absolute)));
		else if (
			entry.name.endsWith('.css') ||
			entry.name.endsWith('.html') ||
			entry.name.endsWith('.svelte')
		)
			output.push(absolute);
	}
	return output;
}

export async function checkRepository(root = process.cwd()) {
	const diagnostics: DesignContractDiagnostic[] = [];
	let foundHeightBandAuthorityFile = false;
	for (const absolute of await sourceFiles(path.join(root, 'src'))) {
		const relative = path.relative(root, absolute).split(path.sep).join('/');
		if (relative === 'src/routes/layout.css') foundHeightBandAuthorityFile = true;
		const source = await readFile(absolute, 'utf8');
		diagnostics.push(...checkDesignContract(relative, source));
	}
	if (!foundHeightBandAuthorityFile) {
		diagnostics.push({
			contract: 'RESP-1',
			name: 'viewport-query',
			path: 'src/routes/layout.css',
			offset: 0,
			message: 'Exactly one structurally valid 560px Height Band authority is required.'
		});
	}
	return diagnostics.sort(
		(left, right) => left.path.localeCompare(right.path) || left.offset - right.offset
	);
}

async function main() {
	const diagnostics = await checkRepository();
	for (const diagnostic of diagnostics) {
		const source = await readFile(path.resolve(diagnostic.path), 'utf8').catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code === 'ENOENT') return '';
				throw error;
			}
		);
		const { line, column } = location(source, diagnostic.offset);
		console.error(
			`${diagnostic.path}:${line}:${column} [${diagnostic.contract}] ${diagnostic.name}: ${diagnostic.message}`
		);
	}
	if (diagnostics.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	await main();
