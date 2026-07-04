import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4173);

const app = buildApp();

app
  .listen({ port: PORT, host: 'localhost' })
  .then(() => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
