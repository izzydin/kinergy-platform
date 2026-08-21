import {
  parseFilterParams,
  parseLimitParam,
  parsePageParam,
  parseSortParam,
  serializeFilterParams,
  serializeSortParam,
} from '../utils/table-url-serializer';

describe('Table URL Serializer Utilities', () => {
  describe('parseSortParam', () => {
    it('returns undefined for empty, null, or non-string values', () => {
      expect(parseSortParam(null)).toBeUndefined();
      expect(parseSortParam(undefined)).toBeUndefined();
      expect(parseSortParam('')).toBeUndefined();
      expect(parseSortParam('   ')).toBeUndefined();
    });

    it('parses standard "field.asc" and "field.desc" formats', () => {
      expect(parseSortParam('name.asc')).toEqual({ id: 'name', desc: false });
      expect(parseSortParam('name.desc')).toEqual({ id: 'name', desc: true });
      expect(parseSortParam('createdAt.DESC')).toEqual({ id: 'createdAt', desc: true });
      expect(parseSortParam('email.ASC')).toEqual({ id: 'email', desc: false });
    });

    it('defaults to ascending when no direction is specified in "field" format', () => {
      expect(parseSortParam('name')).toEqual({ id: 'name', desc: false });
      expect(parseSortParam('status')).toEqual({ id: 'status', desc: false });
    });

    it('returns undefined for malformed sort strings with invalid direction or multiple dots', () => {
      expect(parseSortParam('name.invalid')).toBeUndefined();
      expect(parseSortParam('name.asc.desc')).toBeUndefined();
      expect(parseSortParam('.asc')).toBeUndefined();
      expect(parseSortParam('name.')).toBeUndefined();
    });
  });

  describe('serializeSortParam', () => {
    it('returns undefined for empty or undefined input', () => {
      expect(serializeSortParam(undefined)).toBeUndefined();
      expect(serializeSortParam({ id: '', desc: false })).toBeUndefined();
    });

    it('serializes SortState into standardized string format', () => {
      expect(serializeSortParam({ id: 'name', desc: false })).toBe('name.asc');
      expect(serializeSortParam({ id: 'createdAt', desc: true })).toBe('createdAt.desc');
    });

    it('normalizes string input if passed directly', () => {
      expect(serializeSortParam('name.asc')).toBe('name.asc');
      expect(serializeSortParam('createdAt.DESC')).toBe('createdAt.desc');
      expect(serializeSortParam('invalid.format.more')).toBeUndefined();
    });
  });

  describe('parsePageParam', () => {
    it('returns defaultPage (1) for missing, empty, or non-string values', () => {
      expect(parsePageParam(null)).toBe(1);
      expect(parsePageParam(undefined)).toBe(1);
      expect(parsePageParam('')).toBe(1);
      expect(parsePageParam(null, 3)).toBe(3);
    });

    it('parses valid positive integer pages', () => {
      expect(parsePageParam('1')).toBe(1);
      expect(parsePageParam('5')).toBe(5);
      expect(parsePageParam(' 42 ')).toBe(42);
    });

    it('falls back to defaultPage for invalid, NaN, negative, or zero values', () => {
      expect(parsePageParam('0')).toBe(1);
      expect(parsePageParam('-5')).toBe(1);
      expect(parsePageParam('abc')).toBe(1);
      expect(parsePageParam('NaN')).toBe(1);
      expect(parsePageParam('-10', 2)).toBe(2);
    });

    it('truncates floating point values to integer', () => {
      expect(parsePageParam('3.7')).toBe(3);
    });
  });

  describe('parseLimitParam', () => {
    it('returns defaultLimit for missing, empty, or non-string values', () => {
      expect(parseLimitParam(null)).toBe(10);
      expect(parseLimitParam(undefined, 25)).toBe(25);
      expect(parseLimitParam('')).toBe(10);
    });

    it('parses valid positive limits', () => {
      expect(parseLimitParam('25')).toBe(25);
      expect(parseLimitParam('50', 10)).toBe(50);
    });

    it('restricts to allowedLimits if configured', () => {
      const allowed = [10, 25, 50, 100];
      expect(parseLimitParam('25', 10, allowed)).toBe(25);
      expect(parseLimitParam('33', 10, allowed)).toBe(10); // Not in allowed list -> fallback
      expect(parseLimitParam('1000', 10, allowed)).toBe(10);
    });

    it('falls back to defaultLimit for negative or NaN values', () => {
      expect(parseLimitParam('-10', 20)).toBe(20);
      expect(parseLimitParam('xyz', 20)).toBe(20);
    });
  });

  describe('parseFilterParams', () => {
    interface TestFilters {
      status?: 'ACTIVE' | 'INACTIVE';
      role?: 'ADMIN' | 'OPERATOR';
      archived?: boolean;
    }

    const parsers = {
      status: (raw: string | null) => (raw === 'ACTIVE' || raw === 'INACTIVE' ? raw : undefined),
      role: (raw: string | null) => (raw === 'ADMIN' || raw === 'OPERATOR' ? raw : undefined),
      archived: (raw: string | null) =>
        raw === 'true' ? true : raw === 'false' ? false : undefined,
    };

    it('parses valid filter values from URLSearchParams', () => {
      const params = new URLSearchParams('status=ACTIVE&role=ADMIN&archived=true');
      const parsed = parseFilterParams<TestFilters>(params, parsers);

      expect(parsed).toEqual({
        status: 'ACTIVE',
        role: 'ADMIN',
        archived: true,
      });
    });

    it('ignores invalid or missing filter values safely', () => {
      const params = new URLSearchParams('status=UNKNOWN&archived=not_bool');
      const parsed = parseFilterParams<TestFilters>(params, parsers);

      expect(parsed).toEqual({});
    });

    it('returns empty object when no parsers are provided', () => {
      const params = new URLSearchParams('status=ACTIVE');
      const parsed = parseFilterParams(params);

      expect(parsed).toEqual({});
    });
  });

  describe('serializeFilterParams', () => {
    it('sets valid values in URLSearchParams and deletes empty/undefined values', () => {
      const params = new URLSearchParams('existing=1&status=OLD');

      serializeFilterParams(
        {
          status: 'ACTIVE',
          role: 'ADMIN',
          count: 5,
          empty: '',
          removed: undefined,
          cleared: null,
        },
        params,
      );

      expect(params.get('existing')).toBe('1');
      expect(params.get('status')).toBe('ACTIVE');
      expect(params.get('role')).toBe('ADMIN');
      expect(params.get('count')).toBe('5');
      expect(params.has('empty')).toBe(false);
      expect(params.has('removed')).toBe(false);
      expect(params.has('cleared')).toBe(false);
    });

    it('uses custom serializer functions when provided', () => {
      const params = new URLSearchParams();

      serializeFilterParams({ tags: ['urgent', 'energy'] }, params, {
        tags: (val: unknown) => (Array.isArray(val) ? val.join(',') : undefined),
      });

      expect(params.get('tags')).toBe('urgent,energy');
    });
  });
});
