const { PhotoValidator } = require('./utils/photo-validator');
const { AdminPhotosService } = require('./admin-photos.service');

describe('Admin photos business layer', () => {
  test('AdminPhotosService listPhotos returns full photo list for client-side pagination', async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: '2', name: 'Photo Two', year: 2001, city: 'Cartago' },
      { _id: '1', name: 'Photo One', year: 1990, city: 'San Jose' },
    ]);
    const sort = jest.fn().mockReturnValue({ lean });
    const find = jest.fn().mockReturnValue({ sort });
    const service = new AdminPhotosService({
      photoModelFactory: () => ({ find }),
    });

    const result = await service.listPhotos();

    expect(find).toHaveBeenCalledWith({}, { _id: 1, name: 1, year: 1, city: 1 });
    expect(sort).toHaveBeenCalledWith({ _id: -1 });
    expect(result).toEqual([
      { _id: '2', name: 'Photo Two', year: 2001, city: 'Cartago' },
      { _id: '1', name: 'Photo One', year: 1990, city: 'San Jose' },
    ]);
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
