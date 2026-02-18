const { PaginationQuery } = require('./pagination-query');
const { PhotoValidator } = require('./photo-validator');
const { AdminPhotosService } = require('./admin-photos.service');

describe('Admin photos business layer', () => {
  test('PaginationQuery parses pagination defaults and limit clamp', () => {
    const query = new PaginationQuery();
    expect(query.parsePagination({})).toEqual({ page: 1, limit: 25, skip: 0 });
    expect(query.parsePagination({ page: '3', limit: '1000' })).toEqual({ page: 3, limit: 100, skip: 200 });
  });

  test('PaginationQuery parses sort with field whitelist and direction', () => {
    const query = new PaginationQuery();
    expect(query.parseSort({ sortBy: 'name', sortDir: 'asc' })).toEqual({ name: 1, _id: -1 });
    expect(query.parseSort({ sortBy: 'createdAt', sortDir: 'asc' })).toEqual({ _id: -1 });
  });

  test('PhotoValidator validates create payload requirements', () => {
    const validator = new PhotoValidator();
    expect(validator.validatePayload({}, 'create')).toEqual({ error: 'Name is required' });
    expect(validator.validatePayload({ name: '  Photo A  ', city: '  Cartago  ' }, 'create')).toEqual({
      payload: { name: 'Photo A', city: 'Cartago' },
    });
  });

  test('PhotoValidator validates update payload and object ids', () => {
    const validator = new PhotoValidator();
    expect(validator.validatePayload({}, 'update')).toEqual({
      error: 'At least one field (name, year, city) is required',
    });
    expect(validator.parseObjectId('bad-id')).toBeNull();
  });

  test('AdminPhotosService blocks invalid file traversal on delete-file option', async () => {
    const service = new AdminPhotosService({ getPhotosDir: () => '/photos' });
    const file = await service.removePhotoFileIfRequested({ deleteFile: 'true' }, '../secrets.txt');
    expect(file).toEqual({ requested: true, deleted: false, warning: 'Invalid photo path' });
  });
});
