const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');

describe('Photos API', () => {
  let mongoServer;
  let app;
  let adminAgent;
  const adminPassword = 'test-admin-password';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('concurso_test');
    process.env.PHOTOS_COLLECTION = 'photos_test';
    process.env.SESSION_COOKIE_SECRET = 'test-session-secret';
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(adminPassword, 10);
    process.env.ADMIN_SESSION_TTL_DAYS = '7';

    jest.resetModules();

    app = require('./app');
    adminAgent = request.agent(app);
    const { getPhotoModel } = require('./models/photo');
    const Photo = getPhotoModel();

    await Photo.create([
      { name: 'Photo One', year: 1990, city: 'San Jose' },
      { name: 'Photo Two', year: 2001, city: 'Cartago' },
      { name: 'Photo Three', city: 'Alajuela' },
    ]);
  });

  afterAll(async () => {
    try {
      await mongoose.disconnect();
    } finally {
      if (mongoServer) {
        await mongoServer.stop({ doCleanup: true, force: true });
      }
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

  test('POST /api/admin/login returns 401 with wrong password', async () => {
    const response = await request(app).post('/api/admin/login').send({ password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid credentials' });
  });

  test('GET /api/admin/health denies access without session', async () => {
    const response = await request(app).get('/api/admin/health');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ authenticated: false, error: 'Unauthorized' });
  });

  test('POST /api/admin/login creates an authenticated session cookie', async () => {
    const response = await adminAgent.post('/api/admin/login').send({ password: adminPassword, remember: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: true });
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('admin_sid=')]));
  });

  test('GET /api/admin/session returns true when admin session exists', async () => {
    const response = await adminAgent.get('/api/admin/session');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: true });
  });

  test('GET /api/admin/health allows access with authenticated session', async () => {
    const response = await adminAgent.get('/api/admin/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'admin ok' });
  });

  test('POST /api/admin/logout clears session and revokes protected access', async () => {
    const logoutResponse = await adminAgent.post('/api/admin/logout');
    const healthResponse = await adminAgent.get('/api/admin/health');

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({ authenticated: false });
    expect(healthResponse.status).toBe(401);
  });
});
