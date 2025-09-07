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
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }
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

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true, index: true },
    images: [{ type: String }],
    inventoryCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    priceAtPurchase: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [orderItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'], default: 'pending' }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

// Auth helpers
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const nodemailer = require('nodemailer');

// Email setup (configure via env for real deployment)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
});

async function sendEmail({ to, subject, text, html }) {
  if (!transporter.options.auth) {
    return; // Skip in dev if not configured
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM || 'no-reply@example.com', to, subject, text, html });
}

// Auth middleware
function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.sub) return res.status(401).json({ error: 'Unauthorized' });
  User.findById(req.user.sub)
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      req.currentUser = user;
      next();
    })
    .catch(() => res.status(500).json({ error: 'Server error' }));
}

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
    // Fire and forget email
    sendEmail({
      to: user.email,
      subject: 'Welcome to TIBEB',
      text: `Hi ${firstName}, welcome to TIBEB!`,
      html: `<p>Hi <strong>${firstName}</strong>, welcome to <strong>TIBEB</strong>!</p>`
    }).catch(() => {});
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
    sendEmail({
      to: email,
      subject: 'We received your message',
      text: `Hi ${fullName}, we have received your message.`,
      html: `<p>Hi <strong>${fullName}</strong>, we have received your message.</p>`
    }).catch(() => {});
    res.status(201).json({ id: saved._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Product routes
app.get('/api/products', async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };
    if (q) {
      filter.$or = [
        { name: { $regex: String(q), $options: 'i' } },
        { description: { $regex: String(q), $options: 'i' } }
      ];
    }
    if (category) filter.category = String(category);
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    const pageNum = Math.max(1, parseInt(String(page)) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit)) || 20));
    const [items, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Product.countDocuments(filter)
    ]);
    res.json({ items, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product || !product.isActive) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

app.post('/api/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, category, images, inventoryCount, isActive } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Missing required fields' });
    const product = await Product.create({ name, description, price, category, images, inventoryCount, isActive });
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.put('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.delete('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Order routes
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const { items } = req.body; // [{ product: id, quantity }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items' });
    }
    const productIds = items.map((i) => i.product);
    const products = await Product.find({ _id: { $in: productIds }, isActive: true });
    const idToProduct = new Map(products.map((p) => [String(p._id), p]));
    const orderItems = [];
    let total = 0;
    for (const item of items) {
      const product = idToProduct.get(String(item.product));
      const quantity = Number(item.quantity || 1);
      if (!product || quantity < 1) return res.status(400).json({ error: 'Invalid item' });
      orderItems.push({ product: product._id, quantity, priceAtPurchase: product.price });
      total += product.price * quantity;
    }
    const order = await Order.create({ user: req.user.sub, items: orderItems, totalAmount: total });
    // Notify user
    const me = await User.findById(req.user.sub);
    if (me) {
      sendEmail({
        to: me.email,
        subject: 'Order Confirmation',
        text: `Your order ${order._id} has been placed. Total: ${total} ETB`,
        html: `<p>Your order <strong>${order._id}</strong> has been placed. Total: <strong>${total}</strong> ETB</p>`
      }).catch(() => {});
    }
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Invalid order' });
  }
});

app.get('/api/orders/my', requireAuth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.sub }).sort({ createdAt: -1 }).populate('items.product');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/orders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).populate('user').populate('items.product');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Profile routes
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/me', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { $set: { firstName, lastName } },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: 'Invalid data' });
  }
});

// Admin list endpoints
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/contacts', requireAuth, requireAdmin, async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Dev-only seed
app.post('/api/dev/seed', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).end();
    const count = await Product.countDocuments();
    if (count > 0) return res.json({ ok: true, message: 'Already seeded' });
    const samples = [
      { name: 'Men\'s traditional Cloth', price: 1100, category: 'men', images: ['/img/love-1.jpg'] },
      { name: 'Men\'s traditional Cloth 2', price: 2100, category: 'men', images: ['/img/man-2.jpg'] },
      { name: 'Women\'s traditional Dress', price: 4500, category: 'women', images: ['/img/love-2.jpg'] },
      { name: 'ZURYA', price: 3200, category: 'women', images: ['/img/zurya-1.jpg'] }
    ];
    await Product.insertMany(samples);
    res.json({ ok: true, created: samples.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Seed failed' });
  }
});

// Static hosting for the existing site
const publicDir = path.join(__dirname, '../../TIBEB');
app.use(express.static(publicDir));

// File uploads
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage });

app.post('/api/products/:id/images', requireAuth, requireAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const files = req.files || [];
    const imagePaths = files.map((f) => `/uploads/${path.basename(f.path)}`);
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $push: { images: { $each: imagePaths } } },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Fallback to index.html for any unknown route that matches existing files
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

