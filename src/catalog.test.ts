import { describe, expect, it } from 'vitest';

import { getRecommendedExtensions } from './catalog';

describe('extension catalog recommendations', () => {
  it('prioritizes Codex engineering skills for repo work', () => {
    const ids = getRecommendedExtensions('Codex Frontier', 'engineering').map((item) => item.id);

    expect(ids.slice(0, 2)).toEqual(['github', 'repo-conventions']);
  });

  it('prioritizes Claude strategy and finance capabilities for synthesis work', () => {
    const ids = getRecommendedExtensions('Claude Sonnet', 'strategy').map((item) => item.id);

    expect(ids).toContain('writing');
    expect(ids).toContain('pricing-strategy');
    expect(ids).toContain('research');
    expect(ids).not.toContain('github');
  });
});
