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
  let photosDir;
  let adminSessionCookie;
  const adminPassword = 'test-admin-password';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri('concurso_test');
    process.env.PHOTOS_COLLECTION = 'photos_test';
    process.env.SESSION_COOKIE_SECRET = 'test-session-secret';
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(adminPassword, 10);
    process.env.ADMIN_SESSION_TTL_DAYS = '7';
    process.env.ADMIN_LOGIN_RATE_LIMIT_MAX = '100';
    process.env.CORS_ALLOWED_ORIGINS = 'https://admin.example.com';
    photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concurso-photos-'));
    process.env.PHOTOS_DIR = photosDir;

    jest.resetModules();

    app = require('./app');
    const { getPhotoModel } = require('./models/photo');
    const Photo = getPhotoModel();

    await Photo.create([
      { name: 'Photo One', year: 1990, city: 'San Jose', isPublic: true },
      { name: 'Photo Two', year: 2001, city: 'Cartago', isPublic: false },
      { name: 'Photo Three', city: 'Alajuela', isPublic: true },
    ]);
    fs.writeFileSync(path.join(photosDir, 'Photo One'), 'public-photo');
    fs.writeFileSync(path.join(photosDir, 'Photo Two'), 'private-photo');
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

  test('GET /api/photos/count returns public photo count without admin session', async () => {
    const response = await request(app).get('/api/photos/count');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 2 });
  });

  test('GET /api/year returns only a public random photo without admin session', async () => {
    const response = await request(app).get('/api/year');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        name: 'Photo One',
        year: 1990,
      })
    );
  });

  test('GET /api/city returns only public city photos without admin session', async () => {
    const response = await request(app).get('/api/city');

    expect(response.status).toBe(200);
    expect(['Photo One', 'Photo Three']).toContain(response.body.name);
    expect(response.body.name).not.toBe('Photo Two');
  });

  test('GET /api/photos/file/:name serves public photos without admin session', async () => {
    const response = await request(app).get('/api/photos/file/Photo%20One');

    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('public-photo');
  });

  test('GET /api/photos/file/:name hides private photos without admin session', async () => {
    const response = await request(app).get('/api/photos/file/Photo%20Two');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Photo not found' });
  });

  test('GET /api/admin/session allows single configured CORS origin from env', async () => {
    const response = await request(app).get('/api/admin/session').set('Origin', 'https://admin.example.com');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://admin.example.com');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('GET /api/admin/session allows list-style configured CORS origins from env', async () => {
    process.env.CORS_ALLOWED_ORIGINS = "['https://concurso.pabloquiros.click', 'https://otroconcurso.pabloquiros.xyz']";
    jest.resetModules();
    const appWithListOrigins = require('./app');

    const response = await request(appWithListOrigins)
      .get('/api/admin/session')
      .set('Origin', 'https://otroconcurso.pabloquiros.xyz');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://otroconcurso.pabloquiros.xyz');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
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
    const adminAgent = request.agent(app);
    const response = await adminAgent.post('/api/admin/login').send({ password: adminPassword, remember: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: true });
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('admin_sid=')]));
  });

  describe('when authenticated', () => {
    beforeEach(async () => {
      const loginResponse = await request(app).post('/api/admin/login').send({ password: adminPassword, remember: true });
      adminSessionCookie = loginResponse.headers['set-cookie'];
    });

    test('GET /api/admin/session returns true when admin session exists', async () => {
      const response = await request(app).get('/api/admin/session').set('Cookie', adminSessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ authenticated: true });
    });

    test('GET /api/admin/health allows access with authenticated session', async () => {
      const response = await request(app).get('/api/admin/health').set('Cookie', adminSessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'admin ok' });
    });

    test('GET /api/admin/photos returns full admin photo list for client pagination', async () => {
      const response = await request(app).get('/api/admin/photos').set('Cookie', adminSessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(expect.any(Array));
      expect(response.body).toHaveLength(3);
      expect(response.body[0]).toEqual(
        expect.objectContaining({
          _id: expect.any(String),
          name: expect.any(String),
          isPublic: expect.any(Boolean),
        })
      );
    });

    test('GET /api/photos/count returns total photo count with admin session', async () => {
      const response = await request(app).get('/api/photos/count').set('Cookie', adminSessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ count: 3 });
    });

    test('GET /api/photos/file/:name serves private photos with admin session', async () => {
      const response = await request(app).get('/api/photos/file/Photo%20Two').set('Cookie', adminSessionCookie);

      expect(response.status).toBe(200);
      expect(response.body.toString()).toBe('private-photo');
    });

    test('GET /api/admin/photos/:id returns single photo', async () => {
      const { getPhotoModel } = require('./models/photo');
      const Photo = getPhotoModel();
      const seeded = await Photo.findOne({ name: 'Photo One' }).lean();

      const response = await request(app).get(`/api/admin/photos/${seeded._id}`).set('Cookie', adminSessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          _id: seeded._id.toString(),
          name: 'Photo One',
          year: 1990,
          city: 'San Jose',
          isPublic: true,
        })
      );
    });

    test('POST /api/admin/photos creates photo metadata and stores file', async () => {
      const response = await request(app)
        .post('/api/admin/photos')
        .set('Cookie', adminSessionCookie)
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
          isPublic: false,
        })
      );

      const storedPath = path.join(photosDir, response.body.name);
      expect(fs.existsSync(storedPath)).toBe(true);
    });

    test('PATCH /api/admin/photos/:id updates editable photo metadata fields', async () => {
      const { getPhotoModel } = require('./models/photo');
      const Photo = getPhotoModel();
      const existing = await Photo.findOne({ name: 'Photo Two' }).lean();

      const response = await request(app).patch(`/api/admin/photos/${existing._id}`).set('Cookie', adminSessionCookie).send({
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

    test('PATCH /api/admin/photos/:id updates public visibility', async () => {
      const { getPhotoModel } = require('./models/photo');
      const Photo = getPhotoModel();
      const existing = await Photo.findOne({ name: 'Photo Two' }).lean();

      const response = await request(app).patch(`/api/admin/photos/${existing._id}`).set('Cookie', adminSessionCookie).send({
        isPublic: true,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          _id: existing._id.toString(),
          name: 'Photo Two',
          isPublic: true,
        })
      );
    });


    test('PATCH /api/admin/photos/:id rejects immutable name updates', async () => {
      const { getPhotoModel } = require('./models/photo');
      const Photo = getPhotoModel();
      const existing = await Photo.findOne({ name: 'Photo Two' }).lean();

      const response = await request(app).patch(`/api/admin/photos/${existing._id}`).set('Cookie', adminSessionCookie).send({
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

      const response = await request(app).delete(`/api/admin/photos/${removable._id}`).set('Cookie', adminSessionCookie);

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

});
