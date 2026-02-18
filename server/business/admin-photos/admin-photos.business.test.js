const { PaginationQuery } = require('./utils/pagination-query');
const { PhotoValidator } = require('./utils/photo-validator');
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
      error: 'At least one field (year, city) is required',
    });
    expect(validator.validatePayload({ name: 'Renamed Photo' }, 'update')).toEqual({
      error: 'Name is immutable and cannot be updated',
    });
    expect(validator.parseObjectId('bad-id')).toBeNull();
  });

  test('AdminPhotosService blocks invalid file traversal when deleting stored files', async () => {
    const service = new AdminPhotosService({ getPhotosDir: () => '/photos' });
    const file = await service.removePhotoFile('../secrets.txt');
    expect(file).toEqual({ requested: true, deleted: false, warning: 'Invalid photo path' });
  });

  test('AdminPhotosService removes written file if DB insert fails', async () => {
    const writeFile = jest.fn().mockResolvedValue(undefined);
    const unlink = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockRejectedValue(new Error('db failed'));

    const service = new AdminPhotosService({
      getPhotosDir: () => '/photos',
      fileSystem: { promises: { writeFile, unlink } },
      photoModelFactory: () => ({ create }),
    });

    await expect(
      service.createPhoto(
        { year: 2020, city: 'San Jose' },
        { originalname: 'image.png', buffer: Buffer.from('123') }
      )
    ).rejects.toThrow('db failed');

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledTimes(1);
  });
});
