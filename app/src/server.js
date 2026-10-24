const express = require('express');
const path = require('node:path');
const { Pool } = require('pg');
const { Counter, Histogram, Registry, collectDefaultMetrics } = require('prom-client');

const app = express();
const pool = new Pool();
const port = Number(process.env.PORT || 3000);
const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: 'library_' });

const httpRequestsTotal = new Counter({
  name: 'library_http_requests_total',
  help: 'Total number of HTTP requests handled by the library app.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});
const httpRequestDuration = new Histogram({
  name: 'library_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const resources = {
  books: {
    table: 'books',
    label: 'Sách',
    columns: [
      { name: 'title', label: 'Tên sách', required: true, type: 'text' },
      { name: 'author', label: 'Tác giả', required: true, type: 'text' },
      { name: 'isbn', label: 'ISBN', required: true, type: 'text' },
      { name: 'published_year', label: 'Năm xuất bản', required: false, type: 'number' },
      { name: 'available_copies', label: 'Số bản còn', required: true, type: 'number' },
    ],
  },
  readers: {
    table: 'readers',
    label: 'Độc giả',
    columns: [
      { name: 'full_name', label: 'Họ và tên', required: true, type: 'text' },
      { name: 'email', label: 'Email', required: true, type: 'email' },
      { name: 'phone', label: 'Điện thoại', required: false, type: 'text' },
    ],
  },
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
app.use((request, response, next) => {
  if (request.path === '/metrics') return next();

  const stopTimer = httpRequestDuration.startTimer();
  response.on('finish', () => {
    const route = request.route ? `${request.baseUrl}${request.route.path}` : 'unmatched';
    const labels = {
      method: request.method,
      route,
      status_code: String(response.statusCode),
    };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
  });
  return next();
});

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function getResource(name) {
  return resources[name] || null;
}

function getValues(request, resource) {
  return resource.columns.map((column) => {
    const value = String(request.body[column.name] || '').trim();
    if (!value && !column.required) return column.type === 'number' ? null : '';
    if (!value) throw new Error(`Trường "${column.label}" không được để trống.`);
    if (column.type === 'number' && !Number.isInteger(Number(value))) {
      throw new Error(`Trường "${column.label}" phải là số nguyên.`);
    }
    return column.type === 'number' ? Number(value) : value;
  });
}

app.get('/health', (request, response) => response.json({ status: 'ok' }));
app.get('/metrics', async (request, response, next) => {
  try {
    response.set('Content-Type', metricsRegistry.contentType);
    response.end(await metricsRegistry.metrics());
  } catch (error) {
    next(error);
  }
});

app.get('/', asyncRoute(async (request, response) => {
  const [books, readers] = await Promise.all([
    pool.query('SELECT * FROM books ORDER BY id DESC'),
    pool.query('SELECT * FROM readers ORDER BY id DESC'),
  ]);
  response.render('index', { books: books.rows, readers: readers.rows, error: null });
}));

app.post('/:resource', asyncRoute(async (request, response) => {
  const resource = getResource(request.params.resource);
  if (!resource) return response.sendStatus(404);

  try {
    const values = getValues(request, resource);
    const columnNames = resource.columns.map((column) => column.name);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    await pool.query(
      `INSERT INTO ${resource.table} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values,
    );
    return response.redirect('/');
  } catch (error) {
    if (error.code) throw error;
    const [books, readers] = await Promise.all([
      pool.query('SELECT * FROM books ORDER BY id DESC'),
      pool.query('SELECT * FROM readers ORDER BY id DESC'),
    ]);
    return response.status(400).render('index', {
      books: books.rows,
      readers: readers.rows,
      error: error.message,
    });
  }
}));

app.post('/:resource/:id/update', asyncRoute(async (request, response) => {
  const resource = getResource(request.params.resource);
  if (!resource) return response.sendStatus(404);
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return response.sendStatus(400);

  const values = getValues(request, resource);
  const assignments = resource.columns.map((column, index) => `${column.name} = $${index + 1}`);
  const result = await pool.query(
    `UPDATE ${resource.table} SET ${assignments.join(', ')} WHERE id = $${values.length + 1}`,
    [...values, id],
  );
  if (result.rowCount === 0) return response.sendStatus(404);
  return response.redirect('/');
}));

app.post('/:resource/:id/delete', asyncRoute(async (request, response) => {
  const resource = getResource(request.params.resource);
  if (!resource) return response.sendStatus(404);
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return response.sendStatus(400);
  await pool.query(`DELETE FROM ${resource.table} WHERE id = $1`, [id]);
  return response.redirect('/');
}));

app.use((error, request, response, next) => {
  console.error(error);
  if (response.headersSent) return next(error);
  return response.status(500).send('Đã xảy ra lỗi máy chủ. Vui lòng kiểm tra dữ liệu và thử lại.');
});

const server = app.listen(port, '0.0.0.0', () => console.log(`Library app listening on ${port}`));

async function shutdown() {
  server.close();
  await pool.end();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);