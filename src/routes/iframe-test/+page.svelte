<script lang="ts">
	import { encodeState, type MapState } from '@versatiles/map-state';

	// a small map with every kind of element, encoded here, so the link stays readable when the format changes
	const state: MapState = {
		map: { center: [13.360986424048201, 52.5134277906428], radius: 1097.496025637164 },
		elements: [
			{
				type: 'line',
				points: [
					[13.37106, 52.51842],
					[13.36966, 52.51575],
					[13.3513, 52.51459],
					[13.35097, 52.51489],
					[13.3504, 52.51512],
					[13.34966, 52.51511],
					[13.34917, 52.51483],
					[13.34904, 52.5145],
					[13.34926, 52.51413],
					[13.34967, 52.51395],
					[13.35027, 52.51382],
					[13.35127, 52.50957],
					[13.3519, 52.50677]
				],
				style: { width: 5, color: '#aa0000' }
			},
			{ type: 'marker', point: [13.35139, 52.50655], style: { color: '#aa0000', labelPosition: 'left', label: 'End' } },
			{
				type: 'marker',
				point: [13.37097, 52.51871],
				style: { color: '#aa0000', labelPosition: 'left', label: 'Start' }
			},
			{
				type: 'polygon',
				points: [
					[13.37383, 52.51794],
					[13.37379, 52.51926],
					[13.3718, 52.51926],
					[13.37115, 52.51794]
				],
				style: { color: '#aa0000', pattern: 'diagonal-thin' },
				strokeStyle: { width: 1, color: '#aa0000' }
			},
			{
				type: 'circle',
				point: [13.36106, 52.51089],
				radius: 302,
				style: { color: '#aa000038', pattern: 'diagonal' },
				strokeStyle: { color: '#aa0000' }
			}
		]
	};
	const src = 'view/#' + encodeState(state);
</script>

<table>
	<tbody>
		<tr>
			<td><iframe title="square" style="width:600px;height:600px;" {src}></iframe></td>
			<td><iframe title="vertical" style="width:300px;height:600px;" {src}></iframe></td>
		</tr>
		<tr>
			<td><iframe title="horizontal" style="width:600px;height:300px;" {src}></iframe></td>
			<td></td>
		</tr>
	</tbody>
</table>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
	table {
		margin: 0 auto;
		border-collapse: collapse;
	}
	td {
		padding: 0;
		border: 1px solid #000;
	}
	iframe {
		border: 0;
		box-sizing: border-box;
		display: block;
	}
</style>
