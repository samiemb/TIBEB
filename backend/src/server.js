const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tibeb';
mongoose
  .connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// Models
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

const contactMessageSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    message: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);

// Auth helpers
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Routes
app.post('/api/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ firstName, lastName, email, passwordHash });
    const token = jwt.sign({ sub: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, firstName, lastName, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { fullName, email, message } = req.body;
    if (!fullName || !email || !message) return res.status(400).json({ error: 'Missing fields' });
    const saved = await ContactMessage.create({ fullName, email, message });
    res.status(201).json({ id: saved._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Static hosting for the existing site
const publicDir = path.join(__dirname, '../../TIBEB');
app.use(express.static(publicDir));

// Fallback to index.html for any unknown route that matches existing files
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

