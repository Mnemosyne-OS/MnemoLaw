import { describe, it, expect } from 'vitest';
import { placeKeyOf, rowGroupSpans, spanMayHoldState } from './locusReader';
import type { FileMetaData } from 'hyparquet';

/** The smallest metadata shape rowGroupSpans reads. */
function md(groups: { rows: number; min?: string; max?: string }[]): FileMetaData {
  return {
    schema: [{ name: 'root' }, { name: 'header' }, { name: 'state' }],
    row_groups: groups.map((g) => ({
      num_rows: BigInt(g.rows),
      columns: [
        { meta_data: {} },
        { meta_data: { statistics: g.min === undefined ? undefined : { min_value: g.min, max_value: g.max } } },
      ],
    })),
  } as unknown as FileMetaData;
}

describe('row group selection', () => {
  it('turns row groups into contiguous row spans with their state range', () => {
    const spans = rowGroupSpans(md([{ rows: 10, min: 'ak', max: 'al' }, { rows: 5, min: 'ca', max: 'co' }]));
    expect(spans).toEqual([
      { rowStart: 0, rowEnd: 10, stateMin: 'ak', stateMax: 'al' },
      { rowStart: 10, rowEnd: 15, stateMin: 'ca', stateMax: 'co' },
    ]);
  });

  it('skips a group only when its statistics PROVE the state is absent', () => {
    const [known, unknown] = rowGroupSpans(md([{ rows: 1, min: 'ca', max: 'co' }, { rows: 1 }]));
    expect(spanMayHoldState(known!, 'co')).toBe(true);
    expect(spanMayHoldState(known!, 'tx')).toBe(false);
    // No statistics = "might hold anything": skipping it would lose a city silently.
    expect(spanMayHoldState(unknown!, 'tx')).toBe(true);
  });

  it('keys a place by type, state and name', () => {
    expect(placeKeyOf('cities', 'tx', 'austin')).toBe('cities|tx|austin');
  });
});
