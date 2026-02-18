const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');

describe('Photos API', () => {
  let mongoServer;
  let app;
  let adminAgent;
  let photosDir;
  const adminPassword = 'test-admin-password';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('concurso_test');
    process.env.PHOTOS_COLLECTION = 'photos_test';
    process.env.SESSION_COOKIE_SECRET = 'test-session-secret';
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(adminPassword, 10);
    process.env.ADMIN_SESSION_TTL_DAYS = '7';
    photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concurso-photos-'));
    process.env.PHOTOS_DIR = photosDir;

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
      if (photosDir) {
        fs.rmSync(photosDir, { recursive: true, force: true });
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

  test('GET /api/admin/photos returns paginated admin photo list', async () => {
    const response = await adminAgent.get('/api/admin/photos?page=1&limit=2&sortBy=name&sortDir=asc');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      })
    );
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].name <= response.body.items[1].name).toBe(true);
  });

  test('GET /api/admin/photos/:id returns single photo', async () => {
    const { getPhotoModel } = require('./models/photo');
    const Photo = getPhotoModel();
    const seeded = await Photo.findOne({ name: 'Photo One' }).lean();

    const response = await adminAgent.get(`/api/admin/photos/${seeded._id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        _id: seeded._id.toString(),
        name: 'Photo One',
        year: 1990,
        city: 'San Jose',
      })
    );
  });

  test('POST /api/admin/photos creates photo metadata and stores file', async () => {
    const response = await adminAgent
      .post('/api/admin/photos')
      .field('year', '2010')
      .field('city', 'Heredia')
      .attach('photo', Buffer.from('fake-image-bytes'), 'photo-four.jpg');

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        _id: expect.any(String),
        name: expect.stringMatching(/\.jpg$/),
        year: 2010,
        city: 'Heredia',
      })
    );

    const storedPath = path.join(photosDir, response.body.name);
    expect(fs.existsSync(storedPath)).toBe(true);
  });

  test('PATCH /api/admin/photos/:id updates editable photo metadata fields', async () => {
    const { getPhotoModel } = require('./models/photo');
    const Photo = getPhotoModel();
    const existing = await Photo.findOne({ name: 'Photo Two' }).lean();

    const response = await adminAgent.patch(`/api/admin/photos/${existing._id}`).send({
      city: 'Limon',
      year: 2005,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        _id: existing._id.toString(),
        name: 'Photo Two',
        city: 'Limon',
        year: 2005,
      })
    );
  });


  test('PATCH /api/admin/photos/:id rejects immutable name updates', async () => {
    const { getPhotoModel } = require('./models/photo');
    const Photo = getPhotoModel();
    const existing = await Photo.findOne({ name: 'Photo Two' }).lean();

    const response = await adminAgent.patch(`/api/admin/photos/${existing._id}`).send({
      name: 'Renamed Photo',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Name is immutable and cannot be updated' });
  });

  test('DELETE /api/admin/photos/:id deletes metadata and stored file', async () => {
    const { getPhotoModel } = require('./models/photo');
    const Photo = getPhotoModel();
    const removable = await Photo.create({ name: 'to-delete.jpg', year: 1999, city: 'Puntarenas' });
    const removableFile = path.join(photosDir, 'to-delete.jpg');
    fs.writeFileSync(removableFile, 'delete-me');

    const response = await adminAgent.delete(`/api/admin/photos/${removable._id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        deleted: true,
        file: expect.objectContaining({ requested: true, deleted: true }),
      })
    );

    const stillThere = await Photo.findById(removable._id);
    expect(stillThere).toBeNull();
    expect(fs.existsSync(removableFile)).toBe(false);
  });

});
