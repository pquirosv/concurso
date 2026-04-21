jest.mock('../../models/photo', () => ({
  getPhotoModel: jest.fn(),
}));

const { getPhotoModel } = require('../../models/photo');
const { PhotosService, PhotosServiceError } = require('./photos.service');

describe('PhotosService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('PhotosServiceError stores code and details', () => {
    const error = new PhotosServiceError('X_CODE', 'Message', { field: 'year' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PhotosServiceError');
    expect(error.code).toBe('X_CODE');
    expect(error.message).toBe('Message');
    expect(error.details).toEqual({ field: 'year' });
  });

  test('buildRandomPipeline returns expected aggregation stages', () => {
    const service = new PhotosService();

    expect(service.buildRandomPipeline('year', 7)).toEqual([
      { $match: { isPublic: true, year: { $exists: true } } },
      { $sample: { size: 7 } },
      { $project: { name: 1, year: 1, city: 1, isPublic: 1 } },
    ]);
  });

  test('buildRandomPipeline omits public filter for admin scope', () => {
    const service = new PhotosService();

    expect(service.buildRandomPipeline('city', 5, 'admin')).toEqual([
      { $match: { city: { $exists: true } } },
      { $sample: { size: 5 } },
      { $project: { name: 1, year: 1, city: 1, isPublic: 1 } },
    ]);
  });

  test('loadRandomPool returns normalized docs array', async () => {
    const aggregate = jest.fn().mockResolvedValue([{ name: 'a.jpg' }]);
    getPhotoModel.mockReturnValue({ aggregate });
    const service = new PhotosService();

    await expect(service.loadRandomPool('year')).resolves.toEqual([{ name: 'a.jpg' }]);
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { isPublic: true, year: { $exists: true } } },
      { $sample: { size: expect.any(Number) } },
      { $project: { name: 1, year: 1, city: 1, isPublic: 1 } },
    ]);
  });

  test('loadRandomPool returns empty array when aggregate is not an array', async () => {
    getPhotoModel.mockReturnValue({ aggregate: jest.fn().mockResolvedValue(null) });
    const service = new PhotosService();

    await expect(service.loadRandomPool('city')).resolves.toEqual([]);
  });

  test('getRandomPhotoByField throws typed error for unknown field', async () => {
    const service = new PhotosService();

    await expect(service.getRandomPhotoByField('unknown')).rejects.toMatchObject({
      name: 'PhotosServiceError',
      code: 'INVALID_RANDOM_FIELD',
      details: { field: 'unknown' },
    });
  });

  test('getRandomPhotoByField pops from preloaded pool without loading', async () => {
    const service = new PhotosService();
    service.randomPools.public.year.items = [{ name: 'first' }, { name: 'second' }];
    const loadSpy = jest.spyOn(service, 'loadRandomPool');

    await expect(service.getRandomPhotoByField('year')).resolves.toEqual({ name: 'second' });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(service.randomPools.public.year.items).toEqual([{ name: 'first' }]);
  });

  test('getRandomPhotoByField loads pool once and serves next item', async () => {
    const service = new PhotosService();
    const loadSpy = jest.spyOn(service, 'loadRandomPool').mockResolvedValue([{ name: 'A' }, { name: 'B' }]);

    await expect(service.getRandomPhotoByField('city')).resolves.toEqual({ name: 'B' });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    await expect(service.getRandomPhotoByField('city')).resolves.toEqual({ name: 'A' });
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  test('getRandomPhotoByField keeps public and admin pools separate', async () => {
    const service = new PhotosService();
    const loadSpy = jest.spyOn(service, 'loadRandomPool')
      .mockResolvedValueOnce([{ name: 'public' }])
      .mockResolvedValueOnce([{ name: 'admin' }]);

    await expect(service.getRandomPhotoByField('year', false)).resolves.toEqual({ name: 'public' });
    await expect(service.getRandomPhotoByField('year', true)).resolves.toEqual({ name: 'admin' });
    expect(loadSpy).toHaveBeenNthCalledWith(1, 'year', 'public');
    expect(loadSpy).toHaveBeenNthCalledWith(2, 'year', 'admin');
  });

  test('getRandomPhotoByField returns null when loaded pool is empty', async () => {
    const service = new PhotosService();
    jest.spyOn(service, 'loadRandomPool').mockResolvedValue([]);

    await expect(service.getRandomPhotoByField('year')).resolves.toBeNull();
  });

  test('getRandomYearPhoto and getRandomCityPhoto delegate to random field lookup', async () => {
    const service = new PhotosService();
    const delegate = jest.spyOn(service, 'getRandomPhotoByField').mockResolvedValue({ name: 'x' });

    await service.getRandomYearPhoto();
    await service.getRandomCityPhoto();

    expect(delegate).toHaveBeenNthCalledWith(1, 'year', false);
    expect(delegate).toHaveBeenNthCalledWith(2, 'city', false);
  });

  test('getPhotosCount returns model countDocuments result', async () => {
    const countDocuments = jest.fn().mockResolvedValue(12);
    getPhotoModel.mockReturnValue({ countDocuments });
    const service = new PhotosService();

    await expect(service.getPhotosCount()).resolves.toBe(12);
    expect(countDocuments).toHaveBeenCalledWith({ isPublic: true });
    await service.getPhotosCount(true);
    expect(countDocuments).toHaveBeenCalledWith({});
  });

  test('getCities returns distinct city list with exists filter', async () => {
    const distinct = jest.fn().mockResolvedValue(['San Jose', 'Cartago']);
    getPhotoModel.mockReturnValue({ distinct });
    const service = new PhotosService();

    await expect(service.getCities()).resolves.toEqual(['San Jose', 'Cartago']);
    expect(distinct).toHaveBeenCalledWith('city', { isPublic: true, city: { $exists: true } });
  });

  test('hasYearPhoto maps model exists result into boolean', async () => {
    const exists = jest.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(null);
    getPhotoModel.mockReturnValue({ exists });
    const service = new PhotosService();

    await expect(service.hasYearPhoto()).resolves.toBe(true);
    await expect(service.hasYearPhoto()).resolves.toBe(false);
    expect(exists).toHaveBeenCalledWith({ isPublic: true, year: { $exists: true } });
  });

  test('getAllowedPhotoFile returns file path only for allowed photo records', async () => {
    const lean = jest.fn().mockResolvedValue({ name: 'safe.jpg' });
    const findOne = jest.fn().mockReturnValue({ lean });
    const service = new PhotosService({
      photoModelFactory: () => ({ findOne }),
      getPhotosDir: () => '/photos',
    });

    await expect(service.getAllowedPhotoFile('safe.jpg')).resolves.toBe('/photos/safe.jpg');
    expect(findOne).toHaveBeenCalledWith({ isPublic: true, name: 'safe.jpg' }, { _id: 1, name: 1 });
  });

  test('getAllowedPhotoFile rejects traversal names before querying', async () => {
    const findOne = jest.fn();
    const service = new PhotosService({ photoModelFactory: () => ({ findOne }) });

    await expect(service.getAllowedPhotoFile('../secret.jpg')).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });
});
