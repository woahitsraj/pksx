<script lang="ts">
	import { tick } from 'svelte';

	export type ComboboxOption = {
		value: string;
		label: string;
		meta?: string;
		detail?: string;
		hue?: number;
		chroma?: number;
	};

	interface Props {
		id?: string;
		ariaLabel?: string;
		labelledBy?: string;
		value?: string;
		options: ComboboxOption[];
		placeholder: string;
		searchLabel: string;
		searchPlaceholder?: string;
		disabled?: boolean;
		onSelect: (value: string) => void;
	}

	let {
		id,
		ariaLabel,
		labelledBy,
		value = '',
		options,
		placeholder,
		searchLabel,
		searchPlaceholder = 'Search',
		disabled = false,
		onSelect
	}: Props = $props();

	const uid = $props.id();
	const triggerId = $derived(id ?? `${uid}-trigger`);
	const listId = $derived(`${triggerId}-list`);
	let root: HTMLDivElement | undefined;
	let trigger: HTMLButtonElement | undefined;
	let open = $state(false);
	let search = $state('');
	let activeIndex = $state(0);
	const selected = $derived(options.find((option) => option.value === value));
	const filtered = $derived.by(() => {
		const query = search.trim().toLowerCase();
		if (!query) return options;
		return options.filter((option) =>
			[option.label, option.meta, option.detail, option.value].some((part) =>
				part?.toLowerCase().includes(query)
			)
		);
	});

	function openPicker(focusSearch = true) {
		if (disabled) return;
		if (open) {
			closePicker(true);
			return;
		}

		open = true;
		search = '';
		const selectedIndex = options.findIndex((option) => option.value === value);
		activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
		void tick().then(() => {
			if (focusSearch) document.getElementById(`${triggerId}-search`)?.focus();
			else focusOption(activeIndex);
		});
	}

	function closePicker(restoreFocus = false) {
		open = false;
		search = '';
		activeIndex = 0;
		if (restoreFocus) void tick().then(() => trigger?.focus());
	}

	function choose(option: ComboboxOption) {
		onSelect(option.value);
		closePicker(true);
	}

	function focusOption(index: number) {
		if (filtered.length === 0) return;
		activeIndex = (index + filtered.length) % filtered.length;
		void tick().then(() => document.getElementById(optionId(filtered[activeIndex]))?.focus());
	}

	function optionId(option: ComboboxOption) {
		return `${triggerId}-option-${option.value}`;
	}

	function activeOptionId() {
		const option = filtered[activeIndex];
		return option ? optionId(option) : undefined;
	}

	function handleWindowClick(event: MouseEvent) {
		if (open && event.target instanceof Node && !root?.contains(event.target)) closePicker();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		closePicker(true);
	}

	function attachRoot(node: HTMLDivElement) {
		root = node;
		return () => (root = undefined);
	}

	function attachTrigger(node: HTMLButtonElement) {
		trigger = node;
		return () => (trigger = undefined);
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		event.stopPropagation();
		openPicker(false);
	}

	function handleSearchInput(event: Event) {
		const input = event.currentTarget;
		if (input instanceof HTMLInputElement) {
			search = input.value;
			activeIndex = 0;
		}
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closePicker(true);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopPropagation();
			focusOption(activeIndex);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopPropagation();
			focusOption(filtered.length - 1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			event.stopPropagation();
			const option = filtered[activeIndex];
			if (option) choose(option);
		}
	}

	function handleOptionKeydown(event: KeyboardEvent, optionIndex: number) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closePicker(true);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopPropagation();
			focusOption(optionIndex + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopPropagation();
			focusOption(optionIndex - 1);
		} else if (event.key === 'Home') {
			event.preventDefault();
			event.stopPropagation();
			focusOption(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			event.stopPropagation();
			focusOption(filtered.length - 1);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			const option = filtered[optionIndex];
			if (option) choose(option);
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="pksx-combobox" data-combobox-open={open} {@attach attachRoot}>
	<button
		{@attach attachTrigger}
		id={triggerId}
		type="button"
		class="pksx-combobox-trigger"
		role="combobox"
		aria-label={ariaLabel}
		aria-labelledby={labelledBy}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={listId}
		aria-activedescendant={open ? activeOptionId() : undefined}
		{disabled}
		onclick={() => openPicker()}
		onkeydown={handleTriggerKeydown}
	>
		<span>{selected?.label ?? placeholder}</span>
		{#if selected?.meta}<em>{selected.meta}</em>{/if}
		<i aria-hidden="true">⌄</i>
	</button>

	{#if open}
		<div class="pksx-combobox-popover">
			<input
				id={`${triggerId}-search`}
				type="search"
				data-combobox-search
				data-controller-editing="true"
				aria-label={searchLabel}
				aria-controls={listId}
				aria-activedescendant={activeOptionId()}
				placeholder={searchPlaceholder}
				value={search}
				oninput={handleSearchInput}
				onkeydown={handleSearchKeydown}
			/>
			<div id={listId} class="pksx-combobox-list" role="listbox" aria-label={ariaLabel}>
				{#each filtered as option, optionIndex (option.value)}
					<button
						id={optionId(option)}
						type="button"
						class="pksx-combobox-option"
						class:active={activeIndex === optionIndex}
						class:tinted={option.hue !== undefined}
						role="option"
						data-combobox-option
						aria-selected={option.value === value}
						tabindex={activeIndex === optionIndex ? 0 : -1}
						style={option.hue === undefined
							? undefined
							: `--option-hue: ${option.hue}; --option-chroma: ${option.chroma ?? 0.08}`}
						onclick={() => choose(option)}
						onfocus={() => (activeIndex = optionIndex)}
						onkeydown={(event) => handleOptionKeydown(event, optionIndex)}
					>
						<strong>{option.label}</strong>
						{#if option.meta}<span>{option.meta}</span>{/if}
						{#if option.detail}<em>{option.detail}</em>{/if}
					</button>
				{:else}
					<p>No matches found.</p>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.pksx-combobox {
		position: relative;
		width: 100%;
		min-width: 0;
	}

	.pksx-combobox-trigger,
	.pksx-combobox-popover input {
		width: 100%;
		min-width: 0;
		height: 40px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-hi);
		color: var(--ink);
		font: 750 0.78rem var(--pksx-font-sans);
	}

	.pksx-combobox-trigger {
		display: grid;
		grid-template-columns: minmax(0, 1fr) max-content max-content;
		align-items: center;
		gap: 8px;
		padding: 0 11px;
		text-align: left;
	}

	.pksx-combobox-trigger span,
	.pksx-combobox-option strong {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pksx-combobox-trigger em,
	.pksx-combobox-trigger i {
		color: var(--ink-mute);
		font:
			700 0.62rem var(--pksx-font-mono),
			monospace;
		font-style: normal;
		text-transform: uppercase;
	}

	.pksx-combobox-trigger i {
		font-size: 0.9rem;
	}

	.pksx-combobox-popover {
		position: absolute;
		z-index: 80;
		top: calc(100% + 6px);
		left: 0;
		width: clamp(280px, 100%, 420px);
		max-width: calc(100vw - 32px);
		display: grid;
		gap: 7px;
		padding: 8px;
		border: 1px solid var(--rule-hi);
		border-radius: var(--pksx-radius-md);
		background: var(--paper-hi);
		box-shadow: var(--shadow-deep);
	}

	.pksx-combobox-popover input {
		padding: 0 11px;
	}

	.pksx-combobox-list {
		max-height: 240px;
		display: grid;
		gap: 4px;
		overflow-y: auto;
	}

	.pksx-combobox-option {
		width: 100%;
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) max-content max-content;
		align-items: center;
		gap: 8px;
		padding: 9px 10px;
		border: 1px solid transparent;
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-deep);
		color: var(--ink);
		text-align: left;
	}

	.pksx-combobox-option.tinted {
		background: color-mix(
			in srgb,
			var(--paper-deep),
			oklch(0.72 var(--option-chroma, 0.08) var(--option-hue, 100)) 24%
		);
	}

	.pksx-combobox-option strong {
		font-size: 0.78rem;
	}

	.pksx-combobox-option span,
	.pksx-combobox-option em,
	.pksx-combobox-list p {
		margin: 0;
		color: var(--ink-mute);
		font:
			650 0.6rem var(--pksx-font-mono),
			monospace;
		font-style: normal;
		text-transform: uppercase;
	}

	.pksx-combobox-option[aria-selected='true'] {
		border-color: color-mix(in srgb, var(--rust), transparent 35%);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rust), transparent 50%);
	}

	.pksx-combobox-trigger:focus,
	.pksx-combobox-trigger:focus-visible,
	.pksx-combobox-option.active,
	.pksx-combobox-option:focus-visible,
	.pksx-combobox-popover input:focus-visible {
		border-color: color-mix(in srgb, var(--rust), transparent 20%);
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 55%);
		outline-offset: 1px;
	}

	.pksx-combobox-trigger:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.pksx-combobox-list p {
		padding: 10px;
		text-transform: none;
	}
</style>
