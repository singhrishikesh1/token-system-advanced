require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const tabRoutes = require('./routes/tab');
const pageRoutes = require('./routes/page');
const actionRoutes = require('./routes/action');
const transactionRoutes = require('./routes/transaction');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => {
  res.json({ status: 'token-system-advanced running' });
});

app.use('/auth', authRoutes);
app.use('/tab', tabRoutes);
app.use('/page', pageRoutes);
app.use('/action', actionRoutes);
app.use('/transaction', transactionRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`token-system-advanced listening on http://localhost:${PORT}`);
});
