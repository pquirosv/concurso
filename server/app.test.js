const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('Photos API', () => {
  let mongoServer;
  let app;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('concurso_test');
    process.env.PHOTOS_COLLECTION = 'photos_test';

    jest.resetModules();

    app = require('./app');
    const { getPhotoModel } = require('./models/photo');
    const Photo = getPhotoModel();

    await Photo.create([
      { name: 'Photo One', year: 1990, city: 'San Jose' },
      { name: 'Photo Two', year: 2001, city: 'Cartago' },
      { name: 'Photo Three', city: 'Alajuela' },
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  test('GET /api/ responds with status payload', async () => {
    const response = await request(app).get('/api/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'Photos goes here' });
  });

  test('GET /api/photos/count returns total photos', async () => {
    const response = await request(app).get('/api/photos/count');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 3 });
  });

  test('GET /api/year returns a random photo with year', async () => {
    const response = await request(app).get('/api/year');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        year: expect.any(Number),
      })
    );
  });
});
