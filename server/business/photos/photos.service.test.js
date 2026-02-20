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

  test('getRandomPoolSize returns configured pool size', () => {
    const service = new PhotosService();

    expect(service.getRandomPoolSize()).toEqual(expect.any(Number));
    expect(service.getRandomPoolSize()).toBeGreaterThan(0);
  });

  test('buildRandomPipeline returns expected aggregation stages', () => {
    const service = new PhotosService();

    expect(service.buildRandomPipeline('year', 7)).toEqual([
      { $match: { year: { $exists: true } } },
      { $sample: { size: 7 } },
      { $project: { name: 1, year: 1, city: 1 } },
    ]);
  });

  test('loadRandomPool returns normalized docs array', async () => {
    const aggregate = jest.fn().mockResolvedValue([{ name: 'a.jpg' }]);
    getPhotoModel.mockReturnValue({ aggregate });
    const service = new PhotosService();

    await expect(service.loadRandomPool('year')).resolves.toEqual([{ name: 'a.jpg' }]);
    expect(aggregate).toHaveBeenCalledWith([
      { $match: { year: { $exists: true } } },
      { $sample: { size: expect.any(Number) } },
      { $project: { name: 1, year: 1, city: 1 } },
    ]);
  });

  test('loadRandomPool returns empty array when aggregate is not an array', async () => {
    getPhotoModel.mockReturnValue({ aggregate: jest.fn().mockResolvedValue(null) });
    const service = new PhotosService();

    await expect(service.loadRandomPool('city')).resolves.toEqual([]);
  });

  test('initializeRandomPools resets year and city pools', async () => {
    const service = new PhotosService();
    const resetSpy = jest.spyOn(service, 'resetRandomPool').mockResolvedValue();

    await service.initializeRandomPools();

    expect(resetSpy).toHaveBeenNthCalledWith(1, 'year');
    expect(resetSpy).toHaveBeenNthCalledWith(2, 'city');
  });

  test('resetRandomPool throws typed error for unknown field', async () => {
    const service = new PhotosService();

    await expect(service.resetRandomPool('unknown')).rejects.toMatchObject({
      name: 'PhotosServiceError',
      code: 'INVALID_RANDOM_FIELD',
      details: { field: 'unknown' },
    });
  });

  test('resetRandomPool loads docs and replaces pool items', async () => {
    const service = new PhotosService();
    jest.spyOn(service, 'loadRandomPool').mockResolvedValue([{ name: 'A' }]);

    await service.resetRandomPool('year');

    expect(service.randomPools.year.items).toEqual([{ name: 'A' }]);
    expect(service.randomPools.year.loading).toBeNull();
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
    service.randomPools.year.items = [{ name: 'first' }, { name: 'second' }];
    const loadSpy = jest.spyOn(service, 'loadRandomPool');

    await expect(service.getRandomPhotoByField('year')).resolves.toEqual({ name: 'second' });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(service.randomPools.year.items).toEqual([{ name: 'first' }]);
  });

  test('getRandomPhotoByField waits for active load and serves next item', async () => {
    const service = new PhotosService();
    service.randomPools.city.loading = Promise.resolve().then(() => {
      service.randomPools.city.items = [{ name: 'A' }, { name: 'B' }];
      service.randomPools.city.loading = null;
    });

    await expect(service.getRandomPhotoByField('city')).resolves.toEqual({ name: 'B' });
    await expect(service.getRandomPhotoByField('city')).resolves.toEqual({ name: 'A' });
  });

  test('getRandomPhotoByField returns null when pool is empty and no load is active', async () => {
    const service = new PhotosService();

    await expect(service.getRandomPhotoByField('year')).resolves.toBeNull();
  });

  test('getRandomYearPhoto and getRandomCityPhoto delegate to random field lookup', async () => {
    const service = new PhotosService();
    const delegate = jest.spyOn(service, 'getRandomPhotoByField').mockResolvedValue({ name: 'x' });

    await service.getRandomYearPhoto();
    await service.getRandomCityPhoto();

    expect(delegate).toHaveBeenNthCalledWith(1, 'year');
    expect(delegate).toHaveBeenNthCalledWith(2, 'city');
  });

  test('getPhotosCount returns model countDocuments result', async () => {
    const countDocuments = jest.fn().mockResolvedValue(12);
    getPhotoModel.mockReturnValue({ countDocuments });
    const service = new PhotosService();

    await expect(service.getPhotosCount()).resolves.toBe(12);
    expect(countDocuments).toHaveBeenCalledWith({});
  });

  test('getCities returns distinct city list with exists filter', async () => {
    const distinct = jest.fn().mockResolvedValue(['San Jose', 'Cartago']);
    getPhotoModel.mockReturnValue({ distinct });
    const service = new PhotosService();

    await expect(service.getCities()).resolves.toEqual(['San Jose', 'Cartago']);
    expect(distinct).toHaveBeenCalledWith('city', { city: { $exists: true } });
  });

  test('hasYearPhoto maps model exists result into boolean', async () => {
    const exists = jest.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(null);
    getPhotoModel.mockReturnValue({ exists });
    const service = new PhotosService();

    await expect(service.hasYearPhoto()).resolves.toBe(true);
    await expect(service.hasYearPhoto()).resolves.toBe(false);
    expect(exists).toHaveBeenCalledWith({ year: { $exists: true } });
  });
});
