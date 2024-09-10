import express from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './routes.mjs';

dotenv.config();

const app = express();
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 
});
app.use(limiter);

// Use routes
app.use('/v1/api', routes);

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
const parsedPort = parseInt(PORT, 10);

if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
  console.error('Invalid PORT. Using default port 3000.');
  app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
} else {
  app.listen(parsedPort, () => {
    console.log(`Server running on port: http://localhost:${parsedPort}`);
  });
}