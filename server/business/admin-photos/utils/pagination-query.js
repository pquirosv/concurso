// Parse and normalize admin photo list pagination and sorting query parameters.
class PaginationQuery {
  // Create a query parser with a whitelist of sortable fields.
  constructor(allowedSortFields = ['name', 'year', 'city', '_id']) {
    this.allowedSortFields = new Set(allowedSortFields);
  }

  // Parse a positive integer query parameter with a fallback value.
  parsePositiveInt(value, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  // Parse and clamp pagination inputs used by admin photo list queries.
  parsePagination(query) {
    const page = this.parsePositiveInt(query?.page, 1);
    const limit = Math.min(this.parsePositiveInt(query?.limit, 25), 100);
    return { page, limit, skip: (page - 1) * limit };
  }

  // Parse the sort query into a Mongo sort object with safe defaults.
  parseSort(query) {
    const sortBy = typeof query?.sortBy === 'string' ? query.sortBy : '_id';
    const sortDir = query?.sortDir === 'asc' ? 1 : -1;
    if (!this.allowedSortFields.has(sortBy)) {
      return { _id: -1 };
    }
    return { [sortBy]: sortDir, _id: -1 };
  }
}

module.exports = { PaginationQuery };
