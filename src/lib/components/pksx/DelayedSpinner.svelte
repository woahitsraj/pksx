<script lang="ts">
	import DelayedSpinnerIndicator from './DelayedSpinnerIndicator.svelte';

	interface Props {
		active: boolean;
		label?: string;
	}

	let { active, label = 'Loading' }: Props = $props();
</script>

{#if active}
	<DelayedSpinnerIndicator {label} />
{/if}
